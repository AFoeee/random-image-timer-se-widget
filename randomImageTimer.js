/**
 * This widget randomly picks images from an image pool at predetermined time 
 * intervals and displays them.
 * 
 * Special thanks to Laiyart for the idea.
 */


// Reserved keywords that may become localizable in future versions.
const keywords = {
  random: "random", 
  pause: "pause", 
  resume: "resume", 
  reset: "reset"
};

let triggerPhrase;                  // Command text with appended whitespace.
let isUsableByEveryone;             // If true, everyone can trigger the widget.
let isUsableByMods;
let otherUsers;                     // Those users can trigger the widget, too.

let intervalId = null;              // Used by the update mechanism.
let isBlocked = true;               // Blocks the widget when busy.


// Representation of the #img-layer HTML element.
const imgLayer = {
  container: document.getElementById("img-layer"), 
  urlPool: null,                    // An array of URLs.
  urlPool_remaining: null,          // Used by 'full cycle repetition' option.
  img: null,                        // Current img element.
  
  // Returns a random element of the array.
  getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }, 
  
  /* Can be overwritten to change the behavior. This, in combination with 
   * pickURL() and applyAftermath(), is used to implement the 'full cycle 
   * repetition' mode. */
  supplyPool() {
    return this.urlPool;
  }, 
  
  pickUrl(arr) {
    return this.getRandomElement(arr);
  }, 
  
  applyAftermath(newUrl) {
    // Empty hook.
  }, 
  
  // Promisifies the EventListener for 'transitionend' (opacity transition).
  fadeTo(amount) {
    return new Promise((resolve, reject) => {
      if (this.container.style.opacity != amount) {
        this.container.addEventListener('transitionend', () => {
          resolve(true);
        }, {once: true});
        
        this.container.style.opacity = amount;
      } else {
        resolve(false);
      }
    });
  }, 
  
  // Promisifies the loading of an image source (for a newly created img element).
  createImg(url) {
    return new Promise((resolve, reject) => {
      const newImg = document.createElement('img');
	  
      // Resolves when the source was successfully loaded.
      newImg.onload = () => resolve(newImg);
      
      newImg.onerror = () => reject(new Error(`Couldn't load '${url}'.`));
      
      // Has to be placed after onload() or onerror().
      newImg.src = url;
    });
  }, 
  
  // Encapsulates fading-out, image swapping, fading-in.
  async swapImg(url) {
    // Preload the source, to utilize the waiting time while fading.
    const preloadLink = document.createElement('link');
    preloadLink.href = url;
    preloadLink.rel = 'preload';
    preloadLink.as = 'image';
    document.head.appendChild(preloadLink);
    
    if (this.img) {
      await this.fadeTo(0);
      this.container.removeChild(this.img);
    }
    
    this.img = await this.createImg(url);
    this.container.appendChild(this.img);
    
    await this.fadeTo(1);
    
    // The image is now displayed, the preload element therefore useless.
    preloadLink.remove();
  }, 
  
  async displayRandomImg() {
    /* This function fragmentation was choosen, to allow for alternative picking
     * behavior. */
    const arr = this.supplyPool();
    const newUrl = this.pickUrl(arr);
    
    await this.swapImg(newUrl);
    
    this.applyAftermath(newUrl);
  }, 
  
  displayImg(index) {
    return this.swapImg(this.urlPool[index]);
  }
};


// Representation of the #overlay HTML element.
const overlay = {
  container: document.getElementById("overlay"), 
  elmnt: null,                      // Current element.
  
  // Promisifies the EventListener for 'transitionend' (opacity transition).
  fadeTo(amount) {
    return new Promise((resolve, reject) => {
      if (this.container.style.opacity != amount) {
        this.container.addEventListener('transitionend', () => {
          resolve(true);
        }, {once: true});
        
        this.container.style.opacity = amount;
      } else {
        resolve(false);
      }
    });
  }, 
  
  // Encapsulates fading-out, creating text element, fading-in.
  async displayText(str) {
    if (this.elmnt) {
      await this.fadeTo(0);
      
      this.container.removeChild(this.elmnt);
    }
    
    this.elmnt = document.createElement('span');
    this.elmnt.innerHTML = str;
    this.container.appendChild(this.elmnt);
    
    await this.fadeTo(1);
  }, 
  
  // Fades the overlay out and deletes all subelements.
  async clearSubelmnts() {
    if (this.elmnt) {
      await this.fadeTo(0);
      
      this.container.innerHTML = "";
      this.elmnt = null;
    }
  }
}


const audioAlert = {
  url: null, 
  normalizedVol: null, 
  
  play() {
    if (this.url) {
      /* The Audio object will be removed from memory by the garbage collection 
       * mechanism when playback ends. */
      const sfx = new Audio(this.url);
      sfx.volume = this.normalizedVol;
      sfx.play();
    }
  }
};


// Handles presentation of the values and time progression.
const timer = {
  elmnts: {},                       // Holds the subelements for hour, minute, second.
  startVals: {                      // Original interval time, preserved for reset.
    hour: -1, 
    minute: -1, 
    second: -1
  }, 
  currentVals: {},                  // Tracks the remaining time.
  isPaused: false, 
  
  // Checks if the timer has reached its end state.
  hasReachedGoal() {
    return (this.currentVals.hour === 0) && 
           (this.currentVals.minute === 0) && 
           (this.currentVals.second === 0);
  }, 
  
  // Can be overwritten, to change the presentation of time units.
  formatUnit(n) {
    return n.toString();
  }, 
  
  // Changes displayed value for the hour element.
  updateHourElmnt() {
    if (this.elmnts.hour) {
      this.elmnts.hour.innerHTML = 
          this.formatUnit(this.currentVals.hour);
    }
  }, 
  
  updateMinuteElmnt() {
    if (this.elmnts.minute) {
      this.elmnts.minute.innerHTML = 
          this.formatUnit(this.currentVals.minute);
    }
  }, 
  
  updateSecondElmnt() {
    if (this.elmnts.second) {
      this.elmnts.second.innerHTML = 
          this.formatUnit(this.currentVals.second);
    }
  }, 
  
  reset() {
    this.currentVals.hour = this.startVals.hour;
    this.updateHourElmnt();
    
    this.currentVals.minute = this.startVals.minute;
    this.updateMinuteElmnt();
    
    this.currentVals.second = this.startVals.second;
    this.updateSecondElmnt();
  }, 
  
  /* Reduces the timer by one seconds and manages unit rollovers. Returns false 
   * if the goal was reached. */
  decrease() {
    if (this.hasReachedGoal()) {
      return false;
      
    } else if (this.currentVals.second > 0) {
      this.currentVals.second -= 1;
      this.updateSecondElmnt();
      
    // Rollover for negative seconds.
    } else if (this.currentVals.minute > 0) {
      this.currentVals.minute -= 1;
      this.updateMinuteElmnt();
      
      this.currentVals.second = 59;
      this.updateSecondElmnt();
      
    // Rollover for negative minutes and seconds.
    } else {
      this.currentVals.hour -= 1;
      this.updateHourElmnt();
      
      this.currentVals.minute = 59;
      this.updateMinuteElmnt();
      
      this.currentVals.second = 59;
      this.updateSecondElmnt();
    }
    
    return true;
  }, 
  
  pause() {
    this.isPaused = true;
  }, 
  
  resume() {
    this.isPaused = false;
  }
};


function initializeImgLayer(urlArr, isDifferentImgEnforced, hasFullCycleRepetition) {
  imgLayer.urlPool = [...urlArr];
  
  // Cycle through all URLs before repeating.
  if (hasFullCycleRepetition) {
    imgLayer.urlPool_remaining = [];
    
    // Reset pool if empty.
    imgLayer.supplyPool = function() {
      if (!this.urlPool_remaining.length) {
        this.urlPool_remaining = [...this.urlPool];
      }
      
      return this.urlPool_remaining;
    };
    
    // Remove new URL from the pool.
    imgLayer.applyAftermath = function(newUrl) {
      this.urlPool_remaining = 
          this.urlPool_remaining.filter((url) => (url !== newUrl));
    };
  }
  
  if (isDifferentImgEnforced) {
    imgLayer.pickUrl = function(arr) {
      // Get current URL and temporarily remove it from the pool, then pick.
      const oldUrl = (this.img) ? this.img.src : undefined;
      const cpArr = arr.filter((url) => (url !== oldUrl));
      
      return this.getRandomElement(cpArr);
    };
  }
  
  imgLayer.displayRandomImg();
}


function initializeAudioAlert(url, vol) {
  audioAlert.url = url;
  audioAlert.normalizedVol = vol / 100;
}


// Load google font by name and use it for given element.
function addGoogleFont(elmnt, fontName) {
  const fontLink = document.createElement('link');
  fontLink.href = 
      `https://fonts.googleapis.com/css2?family=${fontName.replaceAll(" ", "+")}`;
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);
  
  elmnt.style.fontFamily = fontName;
}


/* Appends 5 span elements to parent (for hours, minutes, seconds and 2 unit 
 * separators). */
function createTimerSubelmnts(parent, minutes) {
  const subelmnts = {};
  
  // Hour slot, if needed.
  if (minutes > 59) {
    subelmnts.hour = document.createElement('span');
    subelmnts.hour.id = "hour-slot";
    parent.appendChild(subelmnts.hour);
    
    const unitSepElmnt1 = document.createElement('span');
    unitSepElmnt1.classList.add("time-separator");
    unitSepElmnt1.innerHTML = ":";
    parent.appendChild(unitSepElmnt1);
  }
  
  // Minute slot.
  subelmnts.minute = document.createElement('span');
  subelmnts.minute.id = "minute-slot";
  parent.appendChild(subelmnts.minute);
  
  const unitSepElmnt2 = document.createElement('span');
  unitSepElmnt2.classList.add("time-separator");
  unitSepElmnt2.innerHTML = ":";
  parent.appendChild(unitSepElmnt2);
  
  // Second slot.
  subelmnts.second = document.createElement('span');
  subelmnts.second.id = "second-slot";
  parent.appendChild(subelmnts.second);
  
  return subelmnts;
}


function initializeTimer(minutes, fontName, isVisible, padWithZeros, margins) {
  const timerElmnt = document.getElementById("timer");
  
  addGoogleFont(timerElmnt, fontName);
  
  // Only create timer elements if needed.
  if (isVisible && (minutes > 0)) {
    if (margins) {
      timerElmnt.style.marginTop = `${margins.top ?? 0}px`;
      timerElmnt.style.marginRight = `${margins.right ?? 0}px`;
      timerElmnt.style.marginBottom = `${margins.bottom ?? 0}px`;
      timerElmnt.style.marginLeft = `${margins.left ?? 0}px`;
    }
    
    timer.elmnts = createTimerSubelmnts(timerElmnt, minutes);
  }
  
  if (padWithZeros) {
    timer.formatUnit = function(n) {
      return (n < 10) ? ("0" + n) : n.toString();
    };
  }
  
  timer.startVals.hour = Math.trunc(minutes / 60);
  timer.startVals.minute = minutes % 60;
  timer.startVals.second = 0;
  
  timer.reset();
  
  timerElmnt.style.opacity = 1;
};


function activateTestMode(hasColorizedSegments) {
  // Make it easier to understand behavior by colorizing elements.
  if (hasColorizedSegments) {
    const mainContainer = document.getElementsByClassName("main-container")[0];
    mainContainer.style.backgroundColor = "#7E549F";
    
    const displayElmnt = document.getElementById("display");
    displayElmnt.style.backgroundColor = "#92DE8B";
    
    const timerElmnt = document.getElementById("timer");
    timerElmnt.style.backgroundColor = "#FB836F";
  }
}


// Uses the input of a media field to test whether media was added to it.
function isMediaFieldPopulated(input) {
  return (input && (Array.isArray(input) ? (input.length > 0) : true));
}


/* Splits a string at the spaces, but ignores those that appear within quotation
 * marks. */
function parseArgs(str) {
  let args = [];
  
  if (typeof str === 'string') {
    // Reduces multiple whitespaces and splits the string.
    const arr = str
        .replace(/\s+/g, ' ')
        .match(/(?:[^\s"']+|['"][^'"]*["'])+/g);
    
    if (arr) {
      // If there were matches, get rid of quotation marks that may occur.
      args = arr.map(s => s.replace(/["']/g, ""));
    }
  }
  
  return args;
}


function pauseImgChange() {
  if (!timer.isPaused) {
    overlay.displayText("P A U S E D");
    timer.pause();
  }
}


function resumeImgChange() {
  if (timer.isPaused) {
    overlay.clearSubelmnts();
    timer.resume();
  }
}


// Helper function for basic triggering behavior.
function _triggerChange(func) {
  isBlocked = true;
  timer.pause();
  
  audioAlert.play();
  
  return func()
      .then(() => {
        timer.reset();
        
        resumeImgChange();
        
        isBlocked = false;
      });
}


function triggerRandomImgChange() {
  return _triggerChange(() => imgLayer.displayRandomImg());
}


function triggerImgChange(index) {
  return _triggerChange(() => imgLayer.displayImg(index));
}


function onWidgetLoad(obj) {
  const fieldData = obj.detail.fieldData;
  
  if (!isMediaFieldPopulated(fieldData.imgPool)) {
    console.log("Deactivate widget: empty image pool.");
    return;
  }
  
  if (fieldData.isDifferentImgEnforced && (fieldData.imgPool.length < 2)) {
    console.log("Deactivate widget: image pool too small for selected options.");
    return;
  }
  
  triggerPhrase = fieldData.commandText.toLowerCase() + " ";
  
  isUsableByEveryone = (fieldData.permissionLvl === 'everyone');
  isUsableByMods = (fieldData.permissionLvl === 'mods');
  
  otherUsers = fieldData.otherUsers
      .toLowerCase()
      .replace(/\s/g, '')
      .split(",");
  
  initializeImgLayer(
      fieldData.imgPool, 
      fieldData.isDifferentImgEnforced , 
      fieldData.hasFullCycleRepetition);
  
  initializeAudioAlert(
      fieldData.audioAlert_url, 
      fieldData.audioAlert_vol);
  
  const timerMargins = {
    top: fieldData.timerMargin_top, 
    right: fieldData.timerMargin_right, 
    bottom: fieldData.timerMargin_bottom, 
    left: fieldData.timerMargin_left
  };
  
  initializeTimer(
      fieldData.triggerInterval, 
      fieldData.fontFamily, 
      (fieldData.timerVisibility === 'visible'), 
      fieldData.padNumbersWithZero, 
      timerMargins);
  
  if (fieldData.testMode === 'on') {
    activateTestMode(fieldData.hasColorizedSegments);
  }
  
  if (fieldData.startTimerPaused) {
    pauseImgChange();
  }
  
  // The interval running the entire widget.
  if (fieldData.triggerInterval > 0) {
    intervalId = setInterval(() => {
      // Ignore if paused, otherwise try to decrease the timer.
      if (!timer.isPaused && !timer.decrease()) {
        triggerRandomImgChange();
      }
    }, 1000);
  }
  
  isBlocked = false;
}


function onMessage(msg) {
  if (isBlocked) {
    //console.log("Widget is currently blocked. (Message)");
    return;
  }
  
  // Check if the user has enough permissions for the selected mode.
  if (isUsableByEveryone || 
      (isUsableByMods && msg.isModerator()) || 
      msg.isBroadcaster() || 
      msg.usernameOnList(otherUsers)) {
    
    /* To avoid unnecessary processing, only the beginning of the message is 
     * converted to lower case and gets tested. */
    const msgStart = msg.text
        .substring(0, triggerPhrase.length)
        .toLowerCase();
    
    if (msgStart !== triggerPhrase) return;
    
    /* Now that it's established that the chat message begins with the trigger 
     * phrase and that the user is allowed to use the command, the whole message 
     * can be processed. The trigger phrase is cut off, to allow for white space 
     * in it. */
    const args = parseArgs(
        msg.text
            .substring(triggerPhrase.length)
            .toLowerCase());
    
    // Less than 1 arg means a syntactical error.
    if (args.length < 1) return;
    
    // Right now, only the first argument is interpreted.
    if (args[0] === keywords.random) {
      triggerRandomImgChange();
      
    } else if (args[0] === keywords.pause) {
      pauseImgChange();
      
    } else if (args[0] === keywords.resume) {
      resumeImgChange();
      
    } else if (args[0] === keywords.reset) {
      timer.reset();
      
    } else {
      /* Strings that don't represent a valid number should result in 'NaN'. Any 
       * floating point part is ignored. */
      const n = parseInt(args[0]);
      
      if (!isNaN(n) && (n >= 1) && (n <= imgLayer.urlPool.length)) {
        triggerImgChange(n - 1);
      }
    }
  }
}


// Triggered by the UI buttons in the overlay editor.
function onWidgetButton(data) {
  if (isBlocked) {
    //console.log("Widget is currently blocked. (Button)");
    return;
  }
  
  if (data.field === 'triggerButton') {
    triggerRandomImgChange();
    
  } else if (data.field === 'pauseButton') {
    if (timer.isPaused) {
      resumeImgChange();
      
    } else {
      pauseImgChange();
    }
    
  } else if (data.field === 'resetButton') {
    timer.reset();
  }
}


// If the widget is about to get closed, kill the interval.
window.addEventListener("beforeunload", function() {
  if (intervalId) {
    clearInterval(intervalId);
  }
});
