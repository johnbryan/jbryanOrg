let canvas;
let ctx;

let solutions = [];
let triedPositions = 0;
let recursiveCalls = 0;

let almostArranged =
    [ [new xyCoord(-1, -1),   1, false],
      [new xyCoord(-2, -1),  -5, false],
      [new xyCoord(-3, -1),  -5, false],
      [new xyCoord(-5, 2),    1, false],
      [new xyCoord(-1, 5),    5, false],
      [new xyCoord( 0, -1),  -3, false],
      [new xyCoord( 0, 1),    3, false],
      [new xyCoord( 2, 1),   -5, false],
      [new xyCoord( 1, 1.5),  1, false],
      [new xyCoord( 3, 1.5), -3, false],
      [new xyCoord( 0, 3),    3, false],
      [new xyCoord( 2, 3),   -5, false],
    ];

const outerPts = [
  new xyCoord( 0, 0),
  new xyCoord(-1, 0.5),
  new xyCoord(-2, 0),
  new xyCoord(-3, 0.5),
  new xyCoord(-3, 1.5),
  new xyCoord(-3, 2.5),
  new xyCoord(-2, 3),
  new xyCoord(-1, 3.5),
  new xyCoord( 0, 4),
  new xyCoord( 1, 3.5),
  new xyCoord( 2, 3),
  new xyCoord( 3, 2.5),
  new xyCoord( 3, 1.5),
  new xyCoord( 3, 0.5),
  new xyCoord( 2, 0),
  new xyCoord( 1, 0.5),
];

// has pts, triangles, edges
class board {
  constructor(pos, outerPts) {
    this.pos = pos;
    //this.x = pos.x;
    //this.y = pos.y;
    this.outerPts = outerPts;
    this.positions = this.getAllPoints(outerPts);
    this.posSet = new Set(this.positions.map((coord)=>coord.hash()));

    // map: coordHash => piece
    // triangles and edges
    //this.occupiedEdges = new Map();
    this.triangles = [];
    // todo: rename occupiedPoints?
    this.occupiedPoints = new Map();

    // Set all edges and triangles to occupied = null
    for (const pt of this.positions) {
      const adjList = [new xyCoord(pt.x-1, pt.y-.5),
                       new xyCoord(pt.x,   pt.y-1),
                       new xyCoord(pt.x+1, pt.y-.5)];

      //edges
      for (const adjPt of adjList) {
        if (this.containsPoint(adjPt)) {
          //this.occupiedEdges.set()
          this.occupiedPoints.set(xyCoord.averageCoords([pt, adjPt]).hash(), null);
        }
      }

      //triangles
      if (this.containsPoint(adjList[0]) && this.containsPoint(adjList[1])) {
        const pts = [pt, adjList[0], adjList[1]];
        this.triangles.push({
            points: pts,
            center: xyCoord.averageCoords(pts),
        });
        this.occupiedPoints.set(xyCoord.averageCoords(pts).hash(), null);
      }
      if (this.containsPoint(adjList[1]) && this.containsPoint(adjList[2])) {
        const pts = [pt, adjList[1], adjList[2]];
        this.triangles.push({
            points: pts,
            center: xyCoord.averageCoords(pts),
        });
        this.occupiedPoints.set(xyCoord.averageCoords(pts).hash(), null);
      }
    }

    // Limit positions to spots where a piece can actually go.
    const validPositions = [];
    for (const pos of this.positions) {
      const adjList = [new xyCoord(pos.x-1, pos.y-.5),
                       new xyCoord(pos.x,   pos.y-1),
                       new xyCoord(pos.x+1, pos.y-.5),
                       new xyCoord(pos.x-1, pos.y+.5),
                       new xyCoord(pos.x,   pos.y+1),
                       new xyCoord(pos.x+1, pos.y+.5)
                      ];

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

  // return list of all valid positions for pieces
  getAllPoints(outerPts) {
    // order by x, y
    const sortedOuterPts = outerPts.slice();  //copy
    sortedOuterPts.sort((c1, c2) => (c1.x==c2.x) ? c1.y-c2.y : c1.x-c2.x);

    let pts = [];

    let lastPt = sortedOuterPts[0];
    pts.push(lastPt);
    for (let i=1; i < sortedOuterPts.length; i++) {
      const pt = sortedOuterPts[i];

      if (pt.x == lastPt.x) {
        for (let y = lastPt.y+1; y <= pt.y; y++) {
          pts.push(new xyCoord(pt.x, y, false));
        }
      }
      else {
        pts.push(pt);
      }
      lastPt = pt;
    }

    return pts;
  }

  draw() {
    drawArcCycle(ctx, this.outerPts);

    ctx.fillStyle = "white";
    ctx.fill();
    ctx.stroke();

    for (const pt of this.positions) {
      drawPoint(ctx, pt, false, "gray");
    }
  }

  containsPoint(pt) {
    return this.posSet.has(pt.hash());
  }
}

class piece {
  // x in terms of h
  // y in terms of -r
  constructor(edges, game) {
    this.game = game;
    this.edges = edges;
    this.pos = new xyCoord(0,0);

    this.theta = 0;
    this.trueTheta = 0;
    this.z = 0;

    this.symmetrical = (edges[0]==edges[2] && edges[3]==edges[4]);
    this.flipped = false;

    this.occupiedPoints = [];
    this.isValidPos = true;
    this.isStupidPos = false;
  }

  // Determine if this piece's position is valid, invalid, or valid but stupid.
  // If valid, mark its occupied positions so we can evaluate other pieces.
  evaluatePosition(solve) {
    this.trueTheta = this.theta * thetaFactor;

    //vacate old spot
    if (this.isValidPos) {
      const success = this.game.updateOccupancyOrReturnFalse(this, this.occupiedPoints, true);
      if (!success) console.log("Failed vacating current position.");
    }

    const adjTrianglePts = [
      coordFromPolar(this.pos, h*4/3, this.trueTheta - 5*deg30),
      coordFromPolar(this.pos, h*4/3, this.trueTheta - 3*deg30),
      coordFromPolar(this.pos, h*4/3, this.trueTheta - 1*deg30),
      coordFromPolar(this.pos, h*2/3, this.trueTheta + 1*deg30),
      coordFromPolar(this.pos, h*2/3, this.trueTheta + 5*deg30),
    ];
    this.isStupidPos = false;

    this.occupiedPoints = [];

    //find occupied edges and stupid edges
    const edgePoints = [
      coordFromPolar(this.pos, h, this.trueTheta - 5*deg30),
      coordFromPolar(this.pos, h, this.trueTheta - 3*deg30),
      coordFromPolar(this.pos, h, this.trueTheta - 1*deg30),
      coordFromPolar(this.pos, r/2, this.trueTheta),
      coordFromPolar(this.pos, -r/2, this.trueTheta),
    ];
    // Mark edges as occupied, or if unoccupied but there is an adjacent triangle, mark as a stupid position.
    for (let i=0; i<5; i++) {
      const edgeHash = edgePoints[i].hash();
      if (this.edges[i]) {
        this.occupiedPoints.push(edgeHash);
      }
      // This edge is stupid if it's concave (represented by !this.edges[i]) and:
      // - The adjacent triangle is off the board (so the outer edge can't be filled), or
      // - The adjacent triangle is also occupied, but the edge between is empty.
      else {
        if (!this.game.board.occupiedPoints.has(adjTrianglePts[i].hash()) ||
            (this.game.board.occupiedPoints.get(adjTrianglePts[i].hash()) &&
                !this.game.board.occupiedPoints.get(edgeHash))) {
          this.isStupidPos = true;
        }
      }
    }

    const occupiedTrianglePoints = [
      coordFromPolar(this.pos, h*2/3, this.trueTheta - 1*deg30),
      coordFromPolar(this.pos, h*2/3, this.trueTheta - 3*deg30),
      coordFromPolar(this.pos, h*2/3, this.trueTheta - 5*deg30),
    ];
    for (const pt of occupiedTrianglePoints) {
      this.occupiedPoints.push(pt.hash());
    }

    this.isValidPos = this.game.updateOccupancyOrReturnFalse(this, this.occupiedPoints, false);

    if (solve) solveFromSolutions();
  }

  draw() {
    const vertices = [
      coordFromPolar(this.pos, r, this.trueTheta - 3*deg60),
      coordFromPolar(this.pos, r, this.trueTheta - 2*deg60),
      coordFromPolar(this.pos, r, this.trueTheta - 1*deg60),
      coordFromPolar(this.pos, r, this.trueTheta),
      this.pos,
    ];

    drawArcCycle(ctx,
                 vertices,
                 this.edges.map((edge) => !edge));

    ctx.fillStyle = "rgba(160, 100, 60, 0.4)";
    ctx.fill();

    ctx.lineWidth = this.isSelected() ? 5 : 1;
    ctx.strokeStyle = this.isValidPos ? "blue" : "red";
    ctx.stroke();
    ctx.lineWidth = 1;

    // Draw rotation/center point
    if (this.isSelected()) {
      ctx.beginPath();
      ctx.arc(this.pos.trueX, this.pos.trueY, r/13, 0, 2*Math.PI, false);
      ctx.fillStyle = this.isValidPos ? "blue" : "red";
      ctx.fill();
      ctx.strokeStyle = this.isValidPos ? "blue" : "red";
      ctx.stroke();
    }
  }

  isSelected() {
    return (this == this.game.selectedPiece);
  }

  above(otherPiece) {
    return this.z - otherPiece.z;
  }

  move(dx, dy) {
    this.pos = this.pos.addCoord(new xyCoord(dx, dy));
    this.evaluatePosition(true);
  }

  rotate(dtheta) {
    this.theta += dtheta;
    if (this.theta > 6) {
      this.theta = this.theta - 12;
    }
    else if (this.theta <= -6) {
      this.theta = this.theta + 12;
    }
    this.evaluatePosition(true);
  }

  flip(calc) {
    if (!this.symmetrical) {
      const newEdges = [this.edges[2], this.edges[1], this.edges[0], this.edges[4], this.edges[3]];
      this.edges = newEdges;
      this.flipped = !this.flipped;
      if (calc) this.evaluatePosition(true);
    }
  }

  isAtPosition(pos, theta, flipped) {
    return this.pos.equals(pos) &&
           this.theta == theta &&
           (this.symmetrical || this.flipped == flipped);
  }

  setPosition(pos, theta, flipped) {
    triedPositions++;

    this.pos = pos;
    this.theta = theta;
    if (flipped != this.flipped) this.flip(false);
    this.evaluatePosition(false);
  }

  //todo: more exact checking
  containsPoint(pt) {
    const relX = pt.trueX - this.pos.trueX;
    const relY = pt.trueY - this.pos.trueY;
    const distFromPosition = Math.sqrt(relX*relX + relY*relY);
    if (distFromPosition > r) {
      return false;
    }

    const theta = Math.atan2(pt.trueY - this.pos.trueY, pt.trueX - this.pos.trueX);

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
    this.selectedPiece = this.pieces[selectedIndex];

    // Offset of mousedown vs clicked piece position.
    // Used for dragging.
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

    this.relClickX = clickX - this.selectedPiece.pos.trueX;
    this.relClickY = clickY - this.selectedPiece.pos.trueY;
  }

  bringToTop(piece) {
    piece.z = this.nextZ;
    this.nextZ++;
    this.drawOrder.sort((p1, p2) => p1.above(p2));
  }

  // Keep piece in sync with mouse pos, preserving offset from mousedown.
  drag(mouseX, mouseY) {
    const trueX = mouseX - this.relClickX;
    const trueY = mouseY - this.relClickY;

    this.selectedPiece.setPosition(
        new xyCoord(trueX, trueY, true, true),
        this.selectedPiece.theta,
        this.selectedPiece.flipped);
  }

  // todo: Would this be a better place for logic from piece.evaluatePosition()?
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

  // Inverse of this.arrange()
  getCurrentArrangement() {
    return this.pieces.map((piece) => [piece.pos, piece.theta, piece.flipped]);
  }

  //posList is list of [pos,theta,flipped] for each piece.
  arrangePieces(posList) {
    this.arrangeInvisible();
    if (posList.length != this.pieces.length) {
      console.log("arrangePieces() was called with wrong number of positions.")
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
      pieces[i].setPosition(new xyCoord(-10,-10), -3, false);
    }
  }

  arrangeAlmost() {
    this.arrangePieces(almostArranged);
    solveFromSolutions();
  }

  arrangeSolved() {
    this.arrangePieces(
      [ [new xyCoord(-1, 0.5),  1, false],
        [new xyCoord(-2, 1),   -5, false],
        [new xyCoord(-2, 2),   -5, false],
        [new xyCoord(-2, 2),    1, false],
        [new xyCoord(-1, 3.5),  5, false],
        [new xyCoord( 0, 2),   -3, false],
        [new xyCoord( 0, 1),    3, false],
        [new xyCoord( 2, 1),   -5, false],
        [new xyCoord( 1, 1.5),  1, false],
        [new xyCoord( 3, 1.5), -3, false],
        [new xyCoord( 0, 3),    3, false],
        [new xyCoord( 2, 3),   -5, false],
      ]
    );
    solveFromSolutions();
  }

  arrangeScattered() {
    this.arrangePieces(
      [ [new xyCoord(-4, -2), 1, false],
        [new xyCoord(-5, 0), 1, false],
        [new xyCoord(-5, 2), 1, false],
        [new xyCoord(-4, 4), 1, false],
        [new xyCoord(-2, 5), 1, false],
        [new xyCoord( 1, 5), 1, false],
        [new xyCoord( 4,  5), 1, false],
        [new xyCoord( 5, 2.5), 1, false],
        [new xyCoord( 5,  0), 1, false],
        [new xyCoord( 5, -2), 1, false],
        [new xyCoord(-1, -2), 1, false],
        [new xyCoord( 2, -2), 1, false],
      ]
    );
    solveFromSolutions();
  }

  // Solve for remaining open spaces, with remaining pieces.
  // i is the triangle index to continue from.
  solveRecursive(i, remainingPieces) {
    recursiveCalls++;

    // If we've found a solution, yay!
    // todo: remove i==length requirement?
    if (i == this.board.triangles.length || remainingPieces.length == 0) {
      solutions.push(this.getCurrentArrangement());
      return;
    }

    // Find the first empty triangle
    while (myGame.board.occupiedPoints.get(this.board.triangles[i].center.hash())) {
      i++;
    }

    //if we found one
    // todo: instead, have if i=length, return, this take this whole section out of if statement?
    // also though, should i ever equal length?
    if (i < this.board.triangles.length) {
      const triangle = this.board.triangles[i];

      for (const pos of triangle.points) {
        for (let j=0; j<remainingPieces.length; j++) {
          const piece = remainingPieces[j];
          const flipOptions = piece.symmetrical ? [false] : [false, true];

          for (const theta of [-5, -3, -1, 1, 3, 5]) {
            for (const flipped of flipOptions) {

              piece.setPosition(pos, theta, flipped);
              if (this.board.occupiedPoints.get(triangle.center.hash())==piece &&
                  piece.isValidPos && !piece.isStupidPos) {

                const nextRemainingPieces = remainingPieces.slice();
                nextRemainingPieces.splice(j, 1);
                this.solveRecursive(i+1, nextRemainingPieces);
              }
              this.arrangeInvisible(remainingPieces);
            }
          }
        }
      }
    }
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
], 5, new board(new xyCoord(boardX, boardY, true), outerPts));

drawInterval = setInterval(draw, 20);

function solveFromScratch() {
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

  myGame.solveRecursive(0, remaining);

  console.log("Found " + solutions.length + " solutions!");
  console.log("Tried " + triedPositions + " positions!");
  console.log("Recursive calls: " + recursiveCalls);

  console.timeEnd('Time to solve');
  if (solutions.length) myGame.arrangePieces(solutions[0]);
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

  if (document.getElementById("solutionCount")) {
    document.getElementById("solutionCount").innerText = solutions.length;

    const solutionSelect = document.getElementById("solutionSelect");
    const solutionSelectOptions = solutionSelect.options;
    for (let i=solutionSelectOptions.length-1; i>=0; i--) {
      solutionSelectOptions.remove(i);
    }
    for (let i=0; i<solutions.length; i++) {
      // display solutions as 1-indexed (though stored as 0-indexed)
      solutionSelectOptions.add(new Option(i+1, i));
    }

    solutionSelect.onchange = function() {
      myGame.arrangePieces(solutions[solutionSelect.selectedIndex]);
    }
  }
}

function onMouseDown(event) {
  const clickX = event.pageX - canvas.offsetLeft;
  const clickY = event.pageY - canvas.offsetTop;

  // todo: replace this loop with some cool one-line filter function?
  // const clickedPieces = myGame.pieces.filter((piece) => piece.containsPoint(new xyCoord(x,y,true)));
  const clickedPieces = [];
  for (const piece of myGame.pieces) {
    if (piece.containsPoint(new xyCoord(clickX, clickY, true))) {
      clickedPieces.push(piece);
    }
  }

  // todo: total non-issue, but they don't really need to be sorted, just need max z
  if (clickedPieces.length) {
    clickedPieces.sort((p1, p2) => p2.above(p1));  //sort top to bottom
    myGame.select(clickedPieces[0], clickX, clickY);
  }

  myGame.dragging = true;
}

function onMouseMove(event) {
  const mouseX = event.pageX - canvas.offsetLeft;
  const mouseY = event.pageY - canvas.offsetTop;

  if (myGame.dragging) myGame.drag(mouseX, mouseY);
}

function onMouseUp(event) {
  myGame.dragging = false;
  solveFromSolutions();
}

function initialize() {
  canvas = document.getElementById('puzzle');
  if (canvas.getContext) {
    ctx = canvas.getContext('2d');
  }
  canvas.addEventListener('mousedown', onMouseDown, false);
  canvas.addEventListener('mousemove', onMouseMove, false);
  canvas.addEventListener('mouseup', onMouseUp, false);

  myGame.arrangeScattered();
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
      // todo: fix for new coord system
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
        solveFromScratch();
        break;
      case 37:  //left
        myGame.selected().rotate(-2);
        break;
      case 38:  //up
        myGame.selected().flip(true);
        break;
      case 39:  //right
        myGame.selected().rotate(2);
        break;
      case 40:  //down
        myGame.selected().flip(true);
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
        myGame.arrangePieces(solutions[n]);
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
