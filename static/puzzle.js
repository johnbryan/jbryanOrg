const deg60 = Math.PI*1/3;
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

function coordHash(x,y) {
  return Math.floor(x*1000) + Math.floor(y*10);
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
    this.ptSet = new Set(this.pts.map(([ptx,pty])=>coordHash(ptx,pty)));

    // map: coordHash => occupied (bool)
    this.triangles = new Map();
    this.edges = new Map();

    for (const pt of this.pts) {
      const [ptx, pty] = pt;
      const adjList = [[ptx-1, pty-.5], [ptx, pty-1], [ptx+1, pty-.5]];

      for (const adjPt of adjList) {
        if (this.containsPoint(adjPt)) {
          const x = (ptx+adjPt[0]) / 2;
          const y = (pty+adjPt[1]) / 2;
          this.edges.set(coordHash(x,y), false);
        }
      }
      if (this.containsPoint(adjList[0]) && this.containsPoint(adjList[1])) {
        const x = (ptx + adjList[0][0] + adjList[1][0]) / 3;
        const y = (pty + adjList[0][1] + adjList[1][1]) / 3;
        this.triangles.set(coordHash(x,y), false);
      }
      if (this.containsPoint(adjList[1]) && this.containsPoint(adjList[2])) {
        const x = (ptx + adjList[1][0] + adjList[2][0]) / 3;
        const y = (pty + adjList[1][1] + adjList[2][1]) / 3;
        this.triangles.set(coordHash(x,y), false);
      }
    }
  }

  getAllPoints(outerPts) {
    // basically: select * from outerPts order by x, y
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

    ctx.fillStyle = "gray";
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawPoint(x, y) {
    ctx.beginPath();
    ctx.arc(x * xFactor + boardX, y * yFactor + boardY, r/20, 0, 2*Math.PI, false);
    ctx.stroke();
  }

  //could do const time instead of linear with 2d array or coord map
  containsPoint(pt) {
    const [ptx, pty] = pt;
    return this.ptSet.has(coordHash(ptx, pty));
    /*for (const [x,y] of this.pts) {
      if (ptx == x && pty == y) {
        return true;
      }
    }
    return false;*/
  }

}

myBoard = new board(boardX, boardY, outerPts);

class piece {
  // x in terms of h
  // y in terms of -r
  constructor(edges, pieceSet) {
    this.edges = edges;
    this.x = 0;
    this.y = 0;
    this.theta = 0;
    this.pieceSet = pieceSet;

    this.trueX;
    this.trueY;
    this.trueTheta;
    this.calcTrueCoords();

    this.z = 0;
  }

  // get real x,y,theta pos
  // also mark which edges and triangles it occupies
  calcTrueCoords() {
    this.trueX = this.x * xFactor + boardX;
    this.trueY = this.y * yFactor + boardY;
    this.trueTheta = this.theta * thetaFactor;

    // todo: mark occupied/vacated edges and triangles
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

    ctx.fillStyle = "beige";
    ctx.fill();

    ctx.lineWidth = this.isSelected() ? 5 : 1;
    ctx.strokeStyle = this.isInValidPosition() ? "blue" : "red";
    ctx.stroke();

    ctx.restore();
  }

  isSelected() {
    return (this == this.pieceSet.selectedPiece);
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

  updatePosition(x, y, theta) {
    this.x = x;
    this.y = y;
    this.theta = theta;
    this.calcTrueCoords();
  }

  potentiallyClicked(clickX, clickY) {
    const relX = clickX - this.trueX;
    const relY = clickY - this.trueY;
    const clickTheta = Math.atan2(clickY - this.trueY, clickX - this.trueX);
    const distFromPosition = Math.sqrt(relX*relX + relY*relY);

    const relTheta = ((this.trueTheta - clickTheta) + 2*Math.PI) % (2*Math.PI);

    return distFromPosition < h && 0 <= relTheta && relTheta <= Math.PI;
  }

  isInValidPosition() {
    if (! this.pieceSet.board.containsPoint([this.x, this.y])) {
      return false;
    }

    const noOverlappingTriangles = true;
    const noOverlappingEdges = true;

    return noOverlappingTriangles && noOverlappingEdges;
  }
}

class pieceSet {
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
      [ [-4, -2, 0],
        [-5, 0, 0],
        [-5, 2, 0],
        [-4, 4, 0],
        [-2, 5, 0],
        [ 0, 6, 0],
        [ 3, 4, 0],
        [ 4, 2, 0],
        [ 0, 0, 0],
        [ 5, -1, 0],
        [-1, -2, 0],
        [ 2, -2, 0],
      ]
    );
  }
}

pSet = new pieceSet([
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

pSet.arrangeSolved();



function clickHandler(event) {
  const x = event.pageX - canvas.offsetLeft;
  const y = event.pageY - canvas.offsetTop;

  //replace this loop with some cool one-line filter function?
  let clickedPieces = [];
  for (const piece of pSet.pieces) {
    if (piece.potentiallyClicked(x, y)) {
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

    pSet.select(selectedPiece);
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
  //pieces.forEach((p) => p.draw());
  pSet.draw();
  //pts.forEach({x:(ySet)}=>)
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
  var endAngle = Math.atan2(y2 - centerY, x2 - centerX);  // = start - deg60
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
        pSet.selected().rotate(-1);
        break;
      case 39:
        pSet.selected().rotate(1);
        break;
    }
  }
  else {
    switch (e.keyCode) {
      case 37:
        pSet.selected().move(-1, 0);
        break;
      case 38:
        pSet.selected().move(0, .5);
        break;
      case 39:
        pSet.selected().move(1, 0);
        break;
      case 40:
        pSet.selected().move(0, -.5);
        break;
      case 82: //r
        pSet.arrangeSolved();
        break;
      case 83: //s
        //pSet.arrangeScattered();
        break;
    }
  }
};

setInterval(draw, 20);