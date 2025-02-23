let currentMatrixFontColorIndex = 0;
const matrixFontColors = ['#0f0', '#f00', '#00f'];

/** 
 * @type {HTMLCanvasElement}
 */
let canvas;

/** 
 * @type {CanvasRenderingContext2D}
 */
let canvasContext;

/** 
 * @type {number}
 */
let matrixIntervalID;

function setupCanvas() {
    canvas = /** @type {HTMLCanvasElement} */  (document.getElementById('canvas-matrix'));
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvasContext = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
}

function startMatrixBackdrop() {
    //Based of: https://stackoverflow.com/a/67136393/2811166
    
    let cols = Math.floor(window.innerWidth / 20) + 1;
    let ypos = Array(cols).fill(0);

    canvasContext.fillStyle = '#000';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    function matrix () {
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (canvas.width !== w) {
            canvas.width = w;
            cols = Math.floor(window.innerWidth / 20) + 1;
            ypos = Array(cols).fill(0);
        }
        if (canvas.height !== h) {
            canvas.height = h;
        }

        canvasContext.fillStyle = '#0001';
        canvasContext.fillRect(0, 0, w, h);

        canvasContext.fillStyle = matrixFontColors[currentMatrixFontColorIndex];
        canvasContext.font = '15pt monospace';

        ypos.forEach((y, ind) => {
            const text = String.fromCharCode(Math.random() * 128);
            const x = ind * 20;
            canvasContext.fillText(text, x, y);
            if (y > 100 + Math.random() * 10000) ypos[ind] = 0;
            else ypos[ind] = y + 20;
        });
    }

    matrixIntervalID = setInterval(matrix, 50);
}

function matrixBackdropColor() {
    document.body.addEventListener('click', (event) => {
      if (event.target === canvas) {
        currentMatrixFontColorIndex =  (currentMatrixFontColorIndex + 1) % matrixFontColors.length;

        clearInterval(matrixIntervalID);
        startMatrixBackdrop();
      }
    });
}

function pikachu() {
    let pikachuAudio = null;

    const pikachuContainer = /** @type {HTMLElement} */ (document.getElementById('pikachu-container'));

    pikachuContainer.addEventListener('click', () => {
      // If there is an audio currently playing, stop it
      if (pikachuAudio) {
        pikachuAudio.pause();
        pikachuAudio.currentTime = 0;
        pikachuContainer.classList.remove('playing');
      }

      pikachuAudio = new Audio('pikachu.mp3');
      pikachuAudio.play();

      // Change button color to yellow while the audio is playing
      pikachuContainer.classList.add('playing'); 

      // When the audio ends, change button color back to black
      pikachuAudio.onended = () => {
        pikachuContainer.classList.remove('playing');
      };
    });
}

function gb() {
  let gbAudio = null;

  const gbContainer = /** @type {HTMLElement} */ (document.getElementById('console-gb'));

  gbContainer.addEventListener('click', () => {
    // If there is an audio currently playing, stop it
    if (gbAudio) {
      gbAudio.pause();
      gbAudio.currentTime = 0;
    }

    gbAudio = new Audio('gb.mp3');
    gbAudio.volume = 0.3;
    gbAudio.play();
  });
}

function init() {
    setupCanvas();

    startMatrixBackdrop();
    matrixBackdropColor();

    pikachu();
    gb();
}

init();