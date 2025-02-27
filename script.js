// @ts-ignore
let currentMatrixFontColorIndex = +(localStorage.getItem("currentMatrixFontColorIndex")) || 0;
const matrixFontColors = ['#0f0', '#f00', '#00f', '#fff'];

let amountOfPokeballs = 0;
let pokeballsFound = 0;

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

/** 
 * @type {HTMLElement}
 */
let gbContainer;

/** 
 * @type {HTMLElement}
 */
let skillsPopup;
let skillsPopupLink;

/** 
 * @type {HTMLElement}
 */
let workExperiencePopup;
let workExperiencePopupLink;

const catElement = /** @type {HTMLElement} */  (document.getElementById('cat'));
let catRapAudio = null;

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
        // loop through the indexes from `matrixFontColors` ensuring it resets via the remainder operator
        currentMatrixFontColorIndex = (currentMatrixFontColorIndex + 1) % matrixFontColors.length;
        localStorage.setItem("currentMatrixFontColorIndex", currentMatrixFontColorIndex.toString());

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

  gbContainer = /** @type {HTMLElement} */ (document.getElementById('console-gb'));

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

  titanCat();
}

function titanCat() {
  let zeldaItemAudio = null;

  const titanCatIframe = /** @type {HTMLElement} */  (document.getElementById('titan-cat-iframe'));

  gbContainer.addEventListener('dblclick', () => {
    titanCatIframe.classList.toggle('visible');

    if (titanCatIframe.classList.contains('visible') ) {
      // If there is an audio currently playing, stop it
      if (zeldaItemAudio) {
        zeldaItemAudio.pause();
        zeldaItemAudio.currentTime = 0;
      }

      zeldaItemAudio = new Audio('zelda-item.mp3');
      zeldaItemAudio.volume = 0.3;
      zeldaItemAudio.play();
    }
  });
}

function setupResizeEventListener() {
  window.addEventListener("resize", function () {
    if (skillsPopupLink) {
      _positionPopup(skillsPopup, skillsPopupLink);
    } 
    if (workExperiencePopupLink) {
      _positionPopup(workExperiencePopup, workExperiencePopupLink);
    } 
  });
}

function _positionPopup(popup, popupLink) {
  // Get the position and size of the toolbox icon
  let iconRect = popupLink.getBoundingClientRect();

  // Get the height of the popup now that it's visible
  let popupHeight = popup.offsetHeight;

  // Calculate the position for the popup
  let topPosition = iconRect.top - popupHeight - 15; // 15px above the icon
  let leftPosition = iconRect.left + (iconRect.width / 2); // Align the middle of the popup with the middle of the icon

  // Set the popup's position dynamically
  popup.style.top = `${topPosition}px`;
  popup.style.left = `${leftPosition}px`;
}

function toggleSkillsPopup(event) {
  event.preventDefault();

  if (!skillsPopup) {
    skillsPopup = /** @type {HTMLElement} */ (document.getElementById('skills-popup'));
  }
  skillsPopupLink = event.currentTarget;

  // Temporarily make the skillsPopup visible to calculate its height
  skillsPopup.style.visibility = 'hidden'; // Hide the popup for measurement
  skillsPopup.style.display = 'block'; // Ensure the popup is rendered to get the height

  _positionPopup(skillsPopup, skillsPopupLink);

  // Toggle the skillsPopup visibility
  skillsPopup.classList.toggle('show');
  skillsPopupLink.classList.toggle('active');
  
  // Restore skillsPopup visibility (after calculations)
  skillsPopup.style.visibility = 'visible';
  skillsPopup.style.display = '';  // Reset to the default display value

  if (!skillsPopup.classList.contains('show')) {
    skillsPopupLink = null;
  }
}

function toggleWorkExperiencePopup(event) {
  event.preventDefault();

  if (!workExperiencePopup) {
    workExperiencePopup = /** @type {HTMLElement} */ (document.getElementById('work-experience-popup'));
  }
  workExperiencePopupLink = event.currentTarget;

  // Temporarily make the skillsPopup visible to calculate its height
  workExperiencePopup.style.visibility = 'hidden'; // Hide the popup for measurement
  workExperiencePopup.style.display = 'block'; // Ensure the popup is rendered to get the height

  _positionPopup(workExperiencePopup, workExperiencePopupLink);

  // Toggle the workExperiencePopup visibility
  workExperiencePopup.classList.toggle('show');
  workExperiencePopupLink.classList.toggle('active');
  
  // Restore workExperiencePopup visibility (after calculations)
  workExperiencePopup.style.visibility = 'visible';
  workExperiencePopup.style.display = '';  // Reset to the default display value

  if (!workExperiencePopup.classList.contains('show')) {
    workExperiencePopupLink = null;
  }
}

function _CheckIfAllPokeballsFound(pokeballsLeftElement) {
  if (amountOfPokeballs === pokeballsFound) {
    let victoryAudio = null;

    pokeballsLeftElement.innerText = 'Found all Poké Balls!';

    setTimeout(function () {
      // If there is an audio currently playing, stop it
      if (victoryAudio) {
        victoryAudio.pause();
        victoryAudio.currentTime = 0;
      }

      victoryAudio = new Audio('victory.mp3');
      victoryAudio.volume = 0.3;
      victoryAudio.play();
    }, 2000);
  }
}

function pokeballs() {
  const pokeballs = /** @type {HTMLCollectionOf<Element>} */ (document.getElementsByClassName('pokeball'));
  const pokeballsLeftElement = /** @type {HTMLElement} */ (document.getElementById('pokeballs-left'));
  const pokeballsCounterElement = /** @type {HTMLElement} */ (document.getElementById('pokeballs-counter'));

  amountOfPokeballs = pokeballs.length;
  let pokeballAudio = null;

  Array.prototype.forEach.call(pokeballs, function(pokeball) {
    pokeball.addEventListener('click', () => {
      if (pokeball.classList.contains('found')) return;
      if (!pokeballsLeftElement.classList.contains('visible')) pokeballsLeftElement.classList.add('visible');

      pokeballsFound++;
      pokeball.classList.add('found');
      pokeballsCounterElement.innerText = (amountOfPokeballs - pokeballsFound).toString();

      // If there is an audio currently playing, stop it
      if (pokeballAudio) {
        pokeballAudio.pause();
        pokeballAudio.currentTime = 0.5;
      }
  
      pokeballAudio = new Audio('pokeball.mp3');
      pokeballAudio.currentTime = 0.5;
      pokeballAudio.volume = 0.3;
      pokeballAudio.play();

      _CheckIfAllPokeballsFound(pokeballsLeftElement);
    });
  });
}

function cat() {
  const logoContainer = /** @type {HTMLElement} */ (document.getElementById('logo'));
  let catAudio = null;

  logoContainer.addEventListener('click', () => {
    catElement.classList.toggle('visible');

    // If there is an audio currently playing, stop it
    if (catAudio) {
      catAudio.pause();
      catAudio.currentTime = 0;
    }

    // When cat is hidden again, don't play `cat.mp3` and stop `catRap` if cat was rapping
    if (!catElement.classList.contains('visible')) {
      if (catElement.classList.contains('glasses')) {
        catElement.classList.remove('glasses');
        catRap();
      }
      return;
    }

    catAudio = new Audio('cat.mp3');
    catAudio.play();
  });

  catGlasses();
}

function catGlasses() {
  catElement.addEventListener('click', () => {
    catElement.classList.toggle('glasses');
    catRap();
  });
}

function catRap() {
  // If there is an audio currently playing, stop it
  if (catRapAudio) {
    catRapAudio.pause();
    catRapAudio.currentTime = 0;
  }

  if (!catElement.classList.contains('glasses')) return;

  catRapAudio = new Audio('cat_rap.mp3');
  catRapAudio.volume = 0.3;
  catRapAudio.play();
  
  catRapAudio.addEventListener("ended", () => {
    catElement.classList.remove('glasses')
  });
}

function init() {
    setupCanvas();
    setupResizeEventListener();

    startMatrixBackdrop();
    matrixBackdropColor();

    pikachu();
    gb();
    pokeballs();
    cat();
}

init();