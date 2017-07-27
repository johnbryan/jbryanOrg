const deg60 = Math.PI*1/3;
const r = 50;
const h = r * Math.sqrt(3)/2;

// outerPts are relative to this position
const boardX = 400;
const boardY = 500;

xFactor = h;
yFactor = -r;
thetaFactor = Math.PI/6;

let canvas;
let ctx;

let nextZ = 0;

const outerPts = [[ 0, 0],
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

// basically: select * from outerPts order by x, y
const sortedOuterPts = outerPts.slice().sort(([x1,y1], [x2,y2]) => (x1==x2) ? y1-y2 : x1-x2);

function drawPoint(x, y) {
  ctx.beginPath();
  ctx.arc(x * xFactor + boardX, y * yFactor + boardY, r/20, 0, 2*Math.PI, false);
  ctx.stroke();
}

//map of x values to sets of corresponding y values
let pts = new Map();

function isOnBoard(pt_x, pt_y) {
  return pts.has(pt_x) && pts.get(pt_x).has(pt_y);
}

let [lastX,lastY] = sortedOuterPts[0];
pts.set(lastX, new Set([lastY]));
for (let i=1; i < sortedOuterPts.length; i++) {
  const [xi, yi] = sortedOuterPts[i];

  if (xi == lastX) {
    for (let y=lastY+1; y<=yi; y+=1) {
      pts.get(xi).add(y);
    }
  }
  else {
    pts.set(xi, new Set([yi]));
  }
  [lastX,lastY] = [xi, yi];
}

// set of sets of 3 pts
let triangles = new Set();

// set of sets of 2 pts
let edges = new Set();

/*for (const ptx of pts.keys()) {
  for (const pty of pts.get(ptx)) {
    const adjList = [[ptx-1, pty-.5], [ptx, pty-1], [ptx+1, pty-.5]];
    const pt = [ptx, pty];

    debugger;
    for (adjPt of adjList) {
      if (isOnBoard(...adjPt)) {
        edges.add(new Set([pt, adjPt]))
      }
    }
    if (isOnBoard(...adjList[0]) && isOnBoard(...adjList[1])) {
      triangles.add(new Set([pt, adjList[0], adjList[1]]));
    }
    if (isOnBoard(...adjList[1]) && isOnBoard(...adjList[2])) {
      triangles.add(new Set([pt, adjList[1], adjList[2]]));
    }
  }
}*/

console.log("tri: " + triangles.length);
console.log("edges: " + edges.length);

class board {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.pts = outerPts;
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);

    drawArcCycle(this.pts.map(([x,y]) => [x*h, -y*r]));

    ctx.fillStyle = "gray";
    ctx.fill();

    ctx.restore();
  }
}

myBoard = new board(boardX, boardY);

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

class piece {
  // x in terms of h
  // y in terms of -r
  constructor(edges, x, y, theta) {
    this.edges = edges;

    this.x = x;
    this.y = y;
    this.theta = theta;

    this.trueX;
    this.trueY;
    this.trueTheta;
    this.calcTrueCoords();

    this.z = nextZ;
    nextZ++;
  }

  calcTrueCoords() {
    this.trueX = this.x * xFactor + boardX;
    this.trueY = this.y * yFactor + boardY;
    this.trueTheta = this.theta * thetaFactor;
  }

  draw() {
    ctx.save();
    ctx.translate(this.trueX, this.trueY);
    ctx.rotate(this.trueTheta);

    // once rotated, we can use fixed points and !edges
    drawArcCycle([[-r,0],
                  [-r/2,-h],
                  [r/2,-h],
                  [r,0],
                  [0,0]],
                 this.edges.map((edge) => !edge)
                );

    ctx.fillStyle = (this == selectedPiece) ? "blue" : "beige";
    ctx.fill();

    ctx.restore();
  }

  bringToTop() {
    if (nextZ - this.z > 1) {
      this.z = nextZ;
      nextZ++;
      pieces.sort((p1, p2) => p1.z - p2.z);
    }
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.bringToTop();
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

  potentiallyClicked(clickX, clickY) {
    const relX = clickX - this.trueX;
    const relY = clickY - this.trueY;
    const clickTheta = Math.atan2(clickY - this.trueY, clickX - this.trueX);
    const distFromPosition = Math.sqrt(relX*relX + relY*relY);

    const relTheta = ((this.trueTheta - clickTheta) + 2*Math.PI) % (2*Math.PI);

    return distFromPosition < h && 0 <= relTheta && relTheta <= Math.PI;
  }
}

pieces = [
  new piece([0,0,0,1,1], -1, 0.5,  1),
  new piece([1,1,1,1,0], -2, 1,   -5),
  new piece([1,0,1,1,0], -2, 2,   -5),
  new piece([1,0,0,1,0], -2, 2,    1),
  new piece([1,1,1,1,1], -1, 3.5,  5),
  new piece([1,1,0,1,0],  0, 2,   -3),
  new piece([0,0,1,1,1],  0, 1,    3),
  new piece([1,1,1,0,0],  2, 1,   -5),
  new piece([0,1,0,1,1],  1, 1.5,  1),
  new piece([1,1,0,1,1],  3, 1.5, -3),
  new piece([1,0,1,0,0],  0, 3,    3),
  new piece([1,0,1,1,1],  2, 3,   -5),
];

selectedPiece = pieces[5];

function clickHandler(event) {
  const x = event.pageX - canvas.offsetLeft;
  const y = event.pageY - canvas.offsetTop;

  let clickedPieces = [];
  for (const piece of pieces) {
    if (piece.potentiallyClicked(x, y)) {
      clickedPieces.push(piece);
    }
  }

  maxZ = -1;
  for (let i=0; i<clickedPieces.length; i++) {
    if (clickedPieces[i].z > maxZ) {
      selectedPiece = clickedPieces[i];
      maxZ = clickedPieces[i].z;
    }
  }

  selectedPiece.bringToTop();
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
  pieces.forEach((p) => p.draw());
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
// ccList is an optional array of equal length of counterclockwise booleans
// ccList[i] refers to arc between xyList[i] and xyList[i+1]
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

  ctx.stroke();
}

document.onkeydown = function(e) {
  if (e.shiftKey) {
    switch (e.keyCode) {
      case 37:
        selectedPiece.rotate(-1);
        break;
      case 39:
        selectedPiece.rotate(1);
        break;
    }
  }
  else {
    switch (e.keyCode) {
      case 37:
        selectedPiece.move(-1, .5);
        break;
      case 38:
        selectedPiece.move(0, 1);
        break;
      case 39:
        selectedPiece.move(1, -.5);
        break;
      case 40:
        selectedPiece.move(0, -1);
        break;
    }
  }
};

setInterval(draw, 20);