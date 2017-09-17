const r = 70;
const h = r * Math.sqrt(3)/2;

// outerPts are relative to this position
const boardX = 400;
const boardY = 500;

xFactor = h;
yFactor = -r;
thetaFactor = Math.PI/6;

let canvas;
let ctx;

let solutions = [];
let triedPositions = 0;
let recursiveCalls = 0;

const DEBUG = false;

let almostArranged =
    [ [-1, -1,  1, false],
      [-2, -1,   -5, false],
      [-3, -1,   -5, false],
      [-5, 2,    1, false],
      [-1, 5,  5, false],
      [ 0, -1,   -3, false],
      [ 0, 1,    3, false],
      [ 2, 1,   -5, false],
      [ 1, 1.5,  1, false],
      [ 3, 1.5, -3, false],
      [ 0, 3,    3, false],
      [ 2, 3,   -5, false],
    ];

const outerPts = [
  [ 0, 0],
  [-1, 0.5],
  [-2, 0],
  [-3, 0.5],
  [-3, 1.5],
  [-3, 2.5],
  [-2, 3],
  [-1, 3.5],
  [ 0, 4],
  [ 1, 3.5],
  [ 2, 3],
  [ 3, 2.5],
  [ 3, 1.5],
  [ 3, 0.5],
  [ 2, 0],
  [ 1, 0.5],
];

// has pts, triangles, edges
class board {
  constructor(x, y, outerPts) {
    this.x = x;
    this.y = y;
    this.outerPts = outerPts;
    this.positions = this.getAllPoints(outerPts);
    this.posSet = new Set(this.positions.map(([ptx,pty])=>coordHash(ptx, pty, false)));

    // map: coordHash => piece
    // triangles and edges
    //this.occupiedEdges = new Map();
    this.triangles = [];
    this.occupiedPoints = new Map();

    // Set all edges and triangles to occupied = null
    for (const pt of this.positions) {
      const [ptx, pty] = pt;
      const adjList = [[ptx-1, pty-.5], [ptx, pty-1], [ptx+1, pty-.5]];

      //edges
      for (const adjPt of adjList) {
        if (this.containsPoint(adjPt)) {
          const x = (ptx+adjPt[0]) / 2;
          const y = (pty+adjPt[1]) / 2;
          //this.occupiedEdges.set(coordHash(x,y), null);
          this.occupiedPoints.set(coordHash(x,y), null);
        }
      }

      //triangles
      if (this.containsPoint(adjList[0]) && this.containsPoint(adjList[1])) {
        const x = (ptx + adjList[0][0] + adjList[1][0]) / 3;
        const y = (pty + adjList[0][1] + adjList[1][1]) / 3;
        this.triangles.push({hash: coordHash(x,y), points: [pt, adjList[0], adjList[1]]});
        this.occupiedPoints.set(coordHash(x,y), null);
      }
      if (this.containsPoint(adjList[1]) && this.containsPoint(adjList[2])) {
        const x = (ptx + adjList[1][0] + adjList[2][0]) / 3;
        const y = (pty + adjList[1][1] + adjList[2][1]) / 3;
        this.triangles.push({hash: coordHash(x,y), points: [pt, adjList[1], adjList[2]]});
        this.occupiedPoints.set(coordHash(x,y), null);
      }
    }

    // Limit positions to spots where a piece can actually go.
    const validPositions = [];
    for (const pos of this.positions) {
      const [ptx, pty] = pos;
      const adjList = [[ptx-1, pty-.5], [ptx, pty-1], [ptx+1, pty-.5],
                       [ptx-1, pty+.5], [ptx, pty+1], [ptx+1, pty+.5]];

      let neighborCount = 0;
      for (const adjPt of adjList) {
        if (this.containsPoint(adjPt)) {
          neighborCount++;
        }
      }

      if (neighborCount >= 4) {
        validPositions.push(pos);
      }
    }
    this.positions = validPositions;
  }

  // return list of all valid positions for pieces, as [x,y] pairs
  getAllPoints(outerPts) {
    // select * from outerPts order by x, y
    const sortedOuterPts = outerPts.slice().sort(([x1,y1], [x2,y2]) => (x1==x2) ? y1-y2 : x1-x2);

    let pts = [];

    let [lastX,lastY] = sortedOuterPts[0];
    pts.push([lastX, lastY]);
    for (let i=1; i < sortedOuterPts.length; i++) {
      const [xi, yi] = sortedOuterPts[i];

      if (xi == lastX) {
        for (let y=lastY+1; y<=yi; y+=1) {
          pts.push([xi, y]);
        }
      }
      else {
        pts.push([xi, yi]);
      }
      [lastX,lastY] = [xi, yi];
    }

    return pts;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);

    drawArcCycle(ctx, this.outerPts.map(([x,y]) => [x*h, -y*r]));

    ctx.fillStyle = "white";
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    for (const pt of this.positions) {
      const [x,y] = pt;
      drawPoint(ctx, x, y, false);
    }
  }

  containsPoint(point) {
    const [x,y] = point;
    return this.posSet.has(coordHash(x, y, false));
  }
}

class piece {
  // x in terms of h
  // y in terms of -r
  constructor(edges, game) {
    this.game = game;
    this.edges = edges;
    this.x = 0;
    this.y = 0;
    this.theta = 0;

    this.symmetrical = (edges[0]==edges[2] && edges[3]==edges[4]);
    this.flipped = false;

    this.occupiedPoints = [];
    this.isValidPos = true;
    this.isStupidPos = false;

    this.trueX = 0;
    this.trueY = 0;
    this.trueTheta = 0;

    this.z = 0;
  }

  // get real x,y,theta
  // also mark which edges and triangles it occupies
  calcTrueCoords() {
    this.trueX = this.x * xFactor + boardX;
    this.trueY = this.y * yFactor + boardY;
    this.trueTheta = this.theta * thetaFactor;

    const trueXY = [this.trueX, this.trueY];

    //vacate old spot
    if (this.isValidPos) {
      const success = this.game.updateOccupancyOrReturnFalse(this, this.occupiedPoints, true);
      if (!success) console.log("Failed vacating current position.");
    }

    const relAdjTriangles = [
      polarToRect(h*4/3, this.trueTheta - 5*deg30),
      polarToRect(h*4/3, this.trueTheta - 3*deg30),
      polarToRect(h*4/3, this.trueTheta - 1*deg30),
      polarToRect(h*2/3, this.trueTheta + 1*deg30),
      polarToRect(h*2/3, this.trueTheta + 5*deg30),
    ];
    const adjacentTriangles = [];
    this.isStupidPos = false;

    for (const relXY of relAdjTriangles) {
      const [x,y] = addCoords(trueXY, relXY);
      adjacentTriangles.push(coordHash(x, y, true));
    }

    this.occupiedPoints = [];
    //find occupied edges and stupid edges
    const relativeEdges = [
      polarToRect(h, this.trueTheta - 5*deg30),
      polarToRect(h, this.trueTheta - 3*deg30),
      polarToRect(h, this.trueTheta - 1*deg30),
      polarToRect(r/2, this.trueTheta),
      polarToRect(-r/2, this.trueTheta),
    ];
    for (let i=0; i<5; i++) {
      const [x,y] = addCoords(trueXY, relativeEdges[i]);
      const edgeHash = coordHash(x, y, true);
      if (this.edges[i]) {
        this.occupiedPoints.push(edgeHash);
      }
      else {
        if (!this.game.board.occupiedPoints.has(adjacentTriangles[i]) ||
            (this.game.board.occupiedPoints.get(adjacentTriangles[i]) && !this.game.board.occupiedPoints.get(edgeHash))) {
          this.isStupidPos = true;
        }
      }
    }

    //find occupied triangles
    const relativeTriangles = [
      polarToRect(h*2/3, this.trueTheta - 1*deg30),
      polarToRect(h*2/3, this.trueTheta - 3*deg30),
      polarToRect(h*2/3, this.trueTheta - 5*deg30),
    ];
    for (const relXY of relativeTriangles) {
      const [x,y] = addCoords(trueXY, relXY);
      this.occupiedPoints.push(coordHash(x, y, true));
    }

    this.isValidPos = this.game.updateOccupancyOrReturnFalse(this, this.occupiedPoints, false);
  }

  draw() {
    ctx.save();
    ctx.translate(this.trueX, this.trueY);
    ctx.rotate(this.trueTheta);

    drawArcCycle(ctx,
                 [ [-r,0],
                   [-r/2,-h],
                   [r/2,-h],
                   [r,0],
                   [0,0]],
                 this.edges.map((edge) => !edge)
                );

    ctx.fillStyle = "rgba(160, 100, 60, 0.4)";
    ctx.fill();

    ctx.lineWidth = this.isSelected() ? 5 : 1;
    ctx.strokeStyle = this.isValidPos ? "blue" : "red";
    ctx.stroke();

    ctx.restore();

    if (this.isSelected()) {
      drawPoint(ctx, this.trueX, this.trueY, true, (this.isValidPos ? "blue" : "red"));
    }

    if (DEBUG && this.isSelected()) {
      for (const ptHash of this.occupiedPoints) {
        drawPointFromHash(ctx, ptHash);
      }
    }
  }

  isSelected() {
    return (this == this.game.selectedPiece);
  }

  above(otherPiece) {
    return this.z - otherPiece.z;
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.calcTrueCoords();
  }

  rotate(dtheta) {
    this.theta += dtheta;
    if (this.theta > 6) {
      this.theta = this.theta - 12;
    }
    else if (this.theta <= -6) {
      this.theta = this.theta + 12;
    }
    this.calcTrueCoords();
  }

  flip() {
    if (!this.symmetrical) {
      const newEdges = [this.edges[2], this.edges[1], this.edges[0], this.edges[4], this.edges[3]];
      this.edges = newEdges;
      this.flipped = !this.flipped;
      this.calcTrueCoords();
    }
  }

  isAtPosition(x, y, theta, flipped) {
    return this.x == x &&
           this.y == y &&
           this.theta == theta &&
           (this.symmetrical || this.flipped == flipped);
  }

  setPosition(x, y, theta, flipped) {
    triedPositions++;

    this.x = x;
    this.y = y;
    this.theta = theta;
    if (flipped != this.flipped) this.flip();
    this.calcTrueCoords();
  }

  setTrueXY(x, y) {

  }

  //todo: more exact checking
  containsPoint(x, y) {
    const relX = x - this.trueX;
    const relY = y - this.trueY;
    const distFromPosition = Math.sqrt(relX*relX + relY*relY);
    if (distFromPosition > r) {
      return false;
    }

    const theta = Math.atan2(y - this.trueY, x - this.trueX);

    const relTheta = ((this.trueTheta - theta) + 2*Math.PI) % (2*Math.PI);

    return distFromPosition < h && 0 <= relTheta && relTheta <= Math.PI;
  }
}

class game {
  constructor(pieceEdgesList, selectedIndex, board) {
    this.board = board;
    this.pieces = [];

    for (const pieceEdges of pieceEdgesList) {
      this.pieces.push(new piece(pieceEdges, this));
    }

    this.nextZ = 1;
    this.drawOrder = [...this.pieces]; //copy
    this.selectedPiece;
    this.select(this.pieces[selectedIndex]);

    //click vs selected piece position
    this.relClickX;
    this.relClickY;
    this.dragging = false;
  }

  selected() {
    return this.selectedPiece;
  }

  select(piece, clickX, clickY) {
    this.selectedPiece = piece;
    this.bringToTop(piece);

    this.relClickX = clickX - this.selectedPiece.trueX;
    this.relClickY = clickY - this.selectedPiece.trueY;
  }

  bringToTop(piece) {
    piece.z = this.nextZ;
    this.nextZ++;
    this.drawOrder.sort((p1, p2) => p1.above(p2));
  }

  drag(mouseX, mouseY) {
    const trueX = mouseX - this.relClickX;
    const trueY = mouseY - this.relClickY;

    this.selectedPiece.setPosition(
        Math.round((trueX - boardX) / xFactor),
        Math.round((trueY - boardY) / yFactor * 2) / 2,
        this.selectedPiece.theta,
        this.selectedPiece.flipped);
  }

  updateOccupancyOrReturnFalse(piece, points, vacate) {
    for (const ptHash of points) {
      if (!this.board.occupiedPoints.has(ptHash)) {
        return false;
      }
      if (!vacate && this.board.occupiedPoints.get(ptHash)) {
        return false;
      }
    }

    if (vacate) piece = null;
    for (const ptHash of points) {
      this.board.occupiedPoints.set(ptHash, piece);
    }
    return true;
  }

  draw() {
    this.board.draw();
    for (const piece of this.drawOrder) {
      piece.draw();
    }
  }

  //inverse of this.arrange()
  getCurrentArrangement() {
    return this.pieces.map((piece) => [piece.x, piece.y, piece.theta, piece.flipped]);
  }

  //posList is list of [x,y,theta,flipped] for each piece.
  arrange(posList) {
    this.arrangeInvisible();
    if (posList.length != this.pieces.length) {
      console.log("arrange() was called with wrong number of positions.")
      return;
    }
    for (let i=0; i<this.pieces.length; i++) {
      this.pieces[i].setPosition(...posList[i]);
    }
  }

  //takes array of pieces, and disappears them so they won't interfere with anything.
  //if no params passed, do it for all pieces.
  arrangeInvisible(pieces) {
    if (!pieces) pieces = this.pieces;

    for (let i=0; i<pieces.length; i++) {
      pieces[i].setPosition(-10, -10, -3, false);
    }
  }

  arrangeAlmost() {
    this.arrange(almostArranged);
  }

  arrangeSolved() {
    this.arrange(
      [ [-1, 0.5,  1, false],
        [-2, 1,   -5, false],
        [-2, 2,   -5, false],
        [-2, 2,    1, false],
        [-1, 3.5,  5, false],
        [ 0, 2,   -3, false],
        [ 0, 1,    3, false],
        [ 2, 1,   -5, false],
        [ 1, 1.5,  1, false],
        [ 3, 1.5, -3, false],
        [ 0, 3,    3, false],
        [ 2, 3,   -5, false],
      ]
    );
  }

  arrangeScattered() {
    this.arrange(
      [ [-4, -2, 1, false],
        [-5, 0, 1, false],
        [-5, 2, 1, false],
        [-4, 4, 1, false],
        [-2, 5, 1, false],
        [ 1, 5, 1, false],
        [ 4,  5, 1, false],
        [ 5, 2.5, 1, false],
        [ 5,  0, 1, false],
        [ 5, -2, 1, false],
        [-1, -2, 1, false],
        [ 2, -2, 1, false],
      ]
    );
  }

  //i is the triangle number to continue from
  solve(i, remainingPieces) {
    //const space = "  ".repeat(6-remainingPieces.length);
    //console.log(space + "solve(" + i + ", " + remainingPieces.map(p=>p.edges.toString() + " ") + ")");
    recursiveCalls++;
    if (i == this.board.triangles.length || remainingPieces.length == 0) {
      solutions.push(this.getCurrentArrangement());
      //console.log(space + "Found a solution! Still looking for more...")
      return;
    }

    //let failed = true;

    //find the first empty triangle
    while (myGame.board.occupiedPoints.get(this.board.triangles[i].hash)) {
      i++;
    }

    //if we found one
    if (i < this.board.triangles.length) {
      const triangle = this.board.triangles[i];
      //console.log(space + triangle.points);

      for (const point of triangle.points) {
        const [x,y] = point;

        for (let j=0; j<remainingPieces.length; j++) {
          const piece = remainingPieces[j];
          //if (piece.edges[1]==1) debugger;
          const flipOptions = piece.symmetrical ? [false] : [false, true];

          for (const theta of [-5, -3, -1, 1, 3, 5]) {
            for (const flipped of flipOptions) {

              //if (x==-2 && y==1 && theta==-5 && flipped==false) debugger;

              piece.setPosition(x, y, theta, flipped);
              if (this.board.occupiedPoints.get(triangle.hash)==piece &&
                  piece.isValidPos && !piece.isStupidPos) {

                //console.log(space + "Placed: "+piece.edges + " at (" + x + "," + y + "," + theta + "," + flipped + ")");

                const nextRemainingPieces = remainingPieces.slice();
                nextRemainingPieces.splice(j, 1);
                this.solve(i+1, nextRemainingPieces);
                //failed = false;
                //this.arrangeInvisible(nextRemainingPieces);
              }
              this.arrangeInvisible(remainingPieces);
            }
          }
        }
      }
    }
    //if (failed) console.log(space + "no solutions here");
  }

}

myGame = new game([
  [0,0,0,1,1],
  [1,1,1,1,0],
  [1,0,1,1,0],
  [1,0,0,1,0],
  [1,1,1,1,1],
  [1,1,0,1,0],
  [0,0,1,1,1],
  [1,1,1,0,0],
  [0,1,0,1,1],
  [1,1,0,1,1],
  [1,0,1,0,0],
  [1,0,1,1,1],
], 5, new board(boardX, boardY, outerPts));

myGame.arrangeSolved();

drawInterval = setInterval(draw, 20);

function solve() {
  clearInterval(drawInterval);
  console.time('Time to solve');

  solutions = [];
  triedPositions = 0;
  recursiveCalls = 0;

  const remaining = [];
  for (const piece of myGame.pieces) {
    if (!piece.isValidPos) {
      remaining.push(piece);
    }
  }

  myGame.solve(0, remaining);

  console.log("Found " + solutions.length + " solutions!");
  console.log("Tried " + triedPositions + " positions!");
  console.log("Recursive calls: " + recursiveCalls);

  console.timeEnd('Time to solve');
  if (solutions.length) myGame.arrange(solutions[0]);
  setInterval(draw, 20);
}

function solveFromSolutions() {
  solutions = [];

  for (const arrangement of allSolutions) {
    let isStillDoable = true;
    for (let i=0; i<myGame.pieces.length; i++) {
      if (myGame.pieces[i].isValidPos) {
        if (! myGame.pieces[i].isAtPosition(...arrangement[i])) {
          isStillDoable = false;
          continue;  //next arrangement
        }
      }
    }

    if (isStillDoable) {
      solutions.push(arrangement);
    }
  }
}

function clickHandler(event) {
  const x = event.pageX - canvas.offsetLeft;
  const y = event.pageY - canvas.offsetTop;

  //replace this loop with some cool one-line filter function?
  const clickedPieces = [];
  for (const piece of myGame.pieces) {
    if (piece.containsPoint(x, y)) {
      clickedPieces.push(piece);
    }
  }

  if (clickedPieces.length) {
    clickedPieces.sort((p1, p2) => p2.above(p1));  //sort top to bottom
    myGame.select(clickedPieces[0], x, y);
  }

  myGame.dragging = true;
}

function onMouseMove(event) {
  const x = event.pageX - canvas.offsetLeft;
  const y = event.pageY - canvas.offsetTop;

  if (myGame.dragging) myGame.drag(x, y);
}

function onMouseUp(event) {
  myGame.dragging = false;
}

function initialize() {
  canvas = document.getElementById('puzzle');
  if (canvas.getContext) {
    ctx = canvas.getContext('2d');
  }
  //canvas.addEventListener('click', clickHandler, false);
  canvas.addEventListener('mousedown', clickHandler, false);
  canvas.addEventListener('mousemove', onMouseMove, false);
  canvas.addEventListener('mouseup', onMouseUp, false);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  myGame.draw();
}

function printSolutions() {
  console.log("[");
  for (const s of solutions) {
    console.log("  [");
    for (const p of s) {
      console.log("    [" + p + "],");
    }
    console.log("  ]");
  }
  console.log("]");
}

// Shift + arrows to rotate/flip.
// Arrows alone to move.
// Click to select a piece.
// Enter to solve.
document.onkeydown = function(e) {
  if (e.shiftKey) {
    switch (e.keyCode) {
      case 13:  //enter
        solve();
        break;
      case 37:  //left
        myGame.selected().rotate(-2);
        break;
      case 38:  //up
        myGame.selected().flip();
        break;
      case 39:  //right
        myGame.selected().rotate(2);
        break;
      case 40:  //down
        myGame.selected().flip();
        break;
      case 65:  //a
        almostArranged = myGame.getCurrentArrangement();
        break;
    }
  }
  else {
    // Digit 0-9
    if (48 <= e.keyCode && e.keyCode < 58) {
      const n = e.keyCode - 48;
      if (solutions.length > n) {
        myGame.arrange(solutions[n]);
      }
      else {
        if (solutions.length) console.log("Try a number 0-" + (solutions.length-1) + ".");
        else console.log("No solutions available.");
      }
      return;
    }
    switch (e.keyCode) {
      case 13:  //enter
        solveFromSolutions();
        console.log("Still " + solutions.length + " solutions remaining.");
        break;
      case 37:  //left
        myGame.selected().move(-1, 0);
        break;
      case 38:  //up
        myGame.selected().move(0, .5);
        break;
      case 39:  //right
        myGame.selected().move(1, 0);
        break;
      case 40:  //down
        myGame.selected().move(0, -.5);
        break;
      case 65:  //a
        myGame.arrangeAlmost();
        break;
      case 80:  //p
        printSolutions();
        break;
      case 82:  //r
        myGame.arrangeSolved();
        break;
      case 83:  //s
        myGame.arrangeScattered();
        break;
      default:
        console.log("Unused keycode: " + e.keyCode);
        break;
    }
  }
};
