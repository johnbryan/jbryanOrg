const deg15 = Math.PI / 12;
const deg30 = Math.PI / 6;
const deg60 = Math.PI / 3;
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

const DEBUG = false;

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

function coordHash(x, y, isTrueCoords) {
  if (!isTrueCoords) {
    x = x * xFactor + boardX;
    y = y * yFactor + boardY;
  }

  return Math.round(x)*10000 + Math.round(y);
}

function polarToRect(dist, theta) {
  return [dist * Math.cos(theta), dist * Math.sin(theta)];
}

function addCoords(p1, p2) {
  return [p1[0] + p2[0], p1[1] + p2[1]];
}

function drawPoint(x, y, isTrueCoords) {
  if (!isTrueCoords) {
    x = x * xFactor + boardX;
    y = y * yFactor + boardY;
  }

  if (ctx) {
    ctx.beginPath();
    ctx.arc(x, y, r/20, 0, 2*Math.PI, false);
    ctx.stroke();
  }
}

function drawPointFromHash(ptHash) {
  const x = Math.floor(ptHash/10000);
  const y = ptHash%10000;
  drawPoint(x,y,true);
}

class line {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
  }

  draw() {
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
  }
}

// has pts, triangles, edges
class board {
  constructor(x, y, outerPts) {
    this.x = x;
    this.y = y;
    this.outerPts = outerPts;
    this.pts = this.getAllPoints(outerPts);
    this.ptSet = new Set(this.pts.map(([ptx,pty])=>coordHash(ptx, pty, false)));

    // map: coordHash => piece
    this.points = new Map();

    for (const pt of this.pts) {
      const [ptx, pty] = pt;
      const adjList = [[ptx-1, pty-.5], [ptx, pty-1], [ptx+1, pty-.5]];

      for (const adjPt of adjList) {
        if (this.containsPoint(...adjPt)) {
          const x = (ptx+adjPt[0]) / 2;
          const y = (pty+adjPt[1]) / 2;
          this.points.set(coordHash(x,y), null);
        }
      }
      if (this.containsPoint(...adjList[0]) && this.containsPoint(...adjList[1])) {
        const x = (ptx + adjList[0][0] + adjList[1][0]) / 3;
        const y = (pty + adjList[0][1] + adjList[1][1]) / 3;
        this.points.set(coordHash(x,y), null);
      }
      if (this.containsPoint(...adjList[1]) && this.containsPoint(...adjList[2])) {
        const x = (ptx + adjList[1][0] + adjList[2][0]) / 3;
        const y = (pty + adjList[1][1] + adjList[2][1]) / 3;
        this.points.set(coordHash(x,y), null);
      }
    }

    console.log(this.points.size);
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

    drawArcCycle(this.outerPts.map(([x,y]) => [x*h, -y*r]));

    ctx.fillStyle = "white";
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    if (DEBUG) {
      for (const pt of this.ptSet) {
        //drawPointFromHash(pt);
      }
    }
  }

  containsPoint(x, y) {
    return this.ptSet.has(coordHash(x, y, false));
  }

}

myBoard = new board(boardX, boardY, outerPts);

class piece {
  // x in terms of h
  // y in terms of -r
  constructor(edges, game) {
    this.edges = edges;
    this.x = 0;
    this.y = 0;
    this.theta = 0;
    this.game = game;
    this.occupiedPoints = [];
    this.isValidPos = true;
    this.overlapPoint = null;

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
      const success = this.game.updateOccupancyOrReturnFalse(this.occupiedPoints, true);
      if (!success) console.log("Failed vacating current position.");
    }
    const occupiedTriangles = [];
    const occupiedEdges = [];
    const occupiedCorners = [];
    this.overlapPoint = null;

    //find occupied edges
    const relativeEdges = [
      polarToRect(h, this.trueTheta - 5*deg30),
      polarToRect(h, this.trueTheta - 3*deg30),
      polarToRect(h, this.trueTheta - 1*deg30),
      polarToRect(r/2, this.trueTheta),
      polarToRect(-r/2, this.trueTheta),
    ];
    for (let i=0; i<5; i++) {
      if (this.edges[i]) {
        const [x,y] = addCoords(trueXY, relativeEdges[i]);
        occupiedEdges.push(coordHash(x, y, true));
      }
    }
    /*const alsoEdges = [
      polarToRect(r/2, this.trueTheta - deg30),
      polarToRect(r/2, this.trueTheta - 2*deg30),
      polarToRect(r/2, this.trueTheta - 3*deg30),
      polarToRect(r/2, this.trueTheta - 4*deg30),
      polarToRect(r/2, this.trueTheta - 5*deg30),
    ];
    for (const relXY of alsoEdges) {
      const [x,y] = addCoords(trueXY, relXY);
      occupiedEdges.push(coordHash(x, y, true));
    }*/

    //find occupied triangles
    const relativeTriangles = [
      polarToRect(h*2/3, this.trueTheta - 1*deg30),
      //polarToRect(h*2/3, this.trueTheta - 2*deg30),
      polarToRect(h*2/3, this.trueTheta - 3*deg30),
      //polarToRect(h*2/3, this.trueTheta - 4*deg30),
      polarToRect(h*2/3, this.trueTheta - 5*deg30),
    ];
    for (const relXY of relativeTriangles) {
      const [x,y] = addCoords(trueXY, relXY);
      occupiedTriangles.push(coordHash(x, y, true));
    }

    //add points in from corners
    /*const d = Math.sqrt(2) * r * Math.sin(deg15);
    const relativeCorners = [
      addCoords(polarToRect(r, this.trueTheta), polarToRect(-d, this.trueTheta + deg30)),
      polarToRect(r-d, this.trueTheta - deg60),
      polarToRect(r-d, this.trueTheta - 2 * deg60),
      addCoords(polarToRect(-r, this.trueTheta), polarToRect(d, this.trueTheta - deg30)),
    ];
    for (const relXY of relativeCorners) {
      const [x,y] = addCoords(trueXY, relXY);
      occupiedCorners.push(coordHash(x, y, true));
    }*/

    this.occupiedPoints = occupiedTriangles.concat(occupiedEdges); //.concat(occupiedCorners);

    //determine if occupied points overlap anything
    /*if (this.game.board.containsPoint(this.x, this.y)) {
      this.overlapPoint = this.game.findOverlap(this.occupiedPoints);
      this.isValidPos = (this.overlapPoint == null);
    } else {
      this.isValidPos = false;
    }

    //occupy new spot if valid
    if (this.isValidPos) {
      this.game.updateOccupancy(this.occupiedPoints, false);
    }*/

    this.isValidPos = this.game.updateOccupancyOrReturnFalse(this.occupiedPoints, false);
  }

  draw() {
    ctx.save();
    ctx.translate(this.trueX, this.trueY);
    ctx.rotate(this.trueTheta);

    drawArcCycle([ [-r,0],
                   [-r/2,-h],
                   [r/2,-h],
                   [r,0],
                   [0,0]],
                 this.edges.map((edge) => !edge)
                );

    ctx.fillStyle = "rgba(160, 100, 60, 0.4)"; //or "beige";
    ctx.fill();

    ctx.lineWidth = this.isSelected() ? 5 : 1;
    ctx.strokeStyle = this.isValidPos ? "blue" : "red";
    ctx.stroke();

    ctx.restore();

    if (DEBUG && this.isSelected()) {
      for (const ptHash of this.occupiedPoints) {
        drawPointFromHash(ptHash);
      }
      //drawPointFromHash(this.overlapPoint);
    }
  }

  isSelected() {
    return (this == this.game.selectedPiece);
  }

  setZ(z) {
    this.z = z;
  }

  isAbove(otherPiece) {
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
    const newEdges = [this.edges[2], this.edges[1], this.edges[0], this.edges[3], this.edges[4]];
    this.edges = newEdges;
    this.calcTrueCoords();
  }

  updatePosition(x, y, theta) {
    this.x = x;
    this.y = y;
    this.theta = theta;
    this.calcTrueCoords();
  }

  //todo: more exact checking to support tiny overlap checking
  containsPoint(x, y) {
    const relX = x - this.trueX;
    const relY = y - this.trueY;
    const theta = Math.atan2(y - this.trueY, x - this.trueX);
    const distFromPosition = Math.sqrt(relX*relX + relY*relY);

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
  }

  selected() {
    return this.selectedPiece;
  }

  select(piece) {
    this.selectedPiece = piece;
    this.bringToTop(piece);
  }

  bringToTop(piece) {
    piece.setZ(this.nextZ);
    this.nextZ++;
    this.drawOrder.sort((p1, p2) => p1.isAbove(p2));
  }

  /*findOverlap(points) {
    for (const xyHash of points) {
      if (this.board.points.get(xyHash)) {
        return xyHash;
      }
    }

    return null;
  }*/

  updateOccupancyOrReturnFalse(points, vacate) {
    for (const ptHash of points) {
      if (!this.board.points.has(ptHash)) {
        return false;
      }
      if (!vacate && this.board.points.get(ptHash)) {
        return false;
      }
    }

    const piece = vacate ? null : this.selectedPiece;
    for (const ptHash of points) {
      this.board.points.set(ptHash, piece);
    }
    return true;
  }

  draw() {
    for (const piece of this.drawOrder) {
      piece.draw();
    }
  }

  arrange(posList) {
    if (posList.length != this.pieces.length) {
      console.log("arrange() was called with wrong number of positions.")
      return;
    }
    for (let i=0; i<posList.length; i++) {
      this.pieces[i].updatePosition(...posList[i]);
    }
  }

  arrangeSolved() {
    this.arrange(
      [ [-1, 0.5,  1],
        [-2, 1,   -5],
        [-2, 2,   -5],
        [-2, 2,    1],
        [-1, 3.5,  5],
        [ 0, 2,   -3],
        [ 0, 1,    3],
        [ 2, 1,   -5],
        [ 1, 1.5,  1],
        [ 3, 1.5, -3],
        [ 0, 3,    3],
        [ 2, 3,   -5],
      ]
    );
  }

  arrangeScattered() {
    this.arrange(
      [ [-4, -2, 1],
        [-5, 0, 1],
        [-5, 2, 1],
        [-4, 4, 1],
        [-2, 5, 1],
        [ 0, 6, 1],
        [ 3, 4, 1],
        [ 4, 2, 1],
        [ 0, 0, 1],
        [ 5, -1, 1],
        [-1, -2, 1],
        [ 2, -2, 1],
      ]
    );
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
], 5, myBoard);

myGame.arrangeSolved();

function getAllSolutions(game) {
  //have a current partial solution
  //loop thru all valid positions for piece 1, then 2 given 1's location, etc
  //when solved add to list

  //put piece at all myBoard.pts (remainingPoints as dynamic array to optimize?)
  //if piece isInValidPosition, then update partial solution, go to next piece
  //

  //maybe make this recursive, and call with partial pieceSet and partial board.

  solutions = [];
  partialSolution = [];


}

function clickHandler(event) {
  const x = event.pageX - canvas.offsetLeft;
  const y = event.pageY - canvas.offsetTop;

  //replace this loop with some cool one-line filter function?
  let clickedPieces = [];
  for (const piece of myGame.pieces) {
    if (piece.containsPoint(x, y)) {
      clickedPieces.push(piece);
    }
  }

  if (clickedPieces.length) {
    let maxZ = -1;
    let selectedPiece = clickedPieces[0];
    // use isAbove() instead of .z
    for (let i=0; i<clickedPieces.length; i++) {
      if (clickedPieces[i].z > maxZ) {
        selectedPiece = clickedPieces[i];
        maxZ = clickedPieces[i].z;
      }
    }

    myGame.select(selectedPiece);
  }
}

function initialize() {
  canvas = document.getElementById('puzzle');
  if (canvas.getContext) {
    ctx = canvas.getContext('2d');
  }
  canvas.addEventListener('click', clickHandler, false);
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  myBoard.draw();
  myGame.draw();
}

// cc = counterclockwise (boolean)
function drawArc(x1,y1,x2,y2,cc) {
  var diffX = x2 - x1;
  var diffY = y2 - y1;
  var avgX = (x1 + x2) / 2;
  var avgY = (y1 + y2) / 2;
  var ratio = Math.sqrt(3)/2 * (cc ? 1 : -1);

  var centerX = avgX + diffY * ratio;
  var centerY = avgY - diffX * ratio;

  var startAngle = Math.atan2(y1 - centerY, x1 - centerX);
  var endAngle = Math.atan2(y2 - centerY, x2 - centerX);
  ctx.arc(centerX, centerY, r, startAngle, endAngle, cc);
}

// xyList is an array of x,y coords
// ccList is an optional array (of equal length) of counterclockwise booleans
// ccList[i] refers to arc between xyList[i] and xyList[i+1]
// It is the caller's responsibility to call ctx.stroke() after this.
function drawArcCycle(xyList, ccList) {
  // default to all clockwise if no ccList given
  ccList = ccList || Array(xyList.length).fill(false);

  ctx.beginPath();

  let x0,y0,x1,x2,y1,y2;
  for (let i=0; i<xyList.length-1; i++) {
    [x1,y1] = xyList[i];
    [x2,y2] = xyList[i+1];
    drawArc(x1,y1,x2,y2,ccList[i]);
  }
  [x0,y0] = xyList[0];
  drawArc(x2,y2,x0,y0,ccList[ccList.length-1]);
}

document.onkeydown = function(e) {
  if (e.shiftKey) {
    switch (e.keyCode) {
      case 37:
        myGame.selected().rotate(-2);
        break;
      case 38:
        myGame.selected().flip();
        break;
      case 39:
        myGame.selected().rotate(2);
        break;
      case 40:
        myGame.selected().flip();
        break;
    }
  }
  else {
    switch (e.keyCode) {
      case 37:
        myGame.selected().move(-1, 0);
        break;
      case 38:
        myGame.selected().move(0, .5);
        break;
      case 39:
        myGame.selected().move(1, 0);
        break;
      case 40:
        myGame.selected().move(0, -.5);
        break;
      case 82: //r
        myGame.arrangeSolved();
        break;
      case 83: //s
        myGame.arrangeScattered();
        break;
    }
  }
};

setInterval(draw, 20);