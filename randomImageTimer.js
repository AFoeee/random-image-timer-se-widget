/**
 * This widget randomly picks images from an image pool at predetermined time 
 * intervals and displays them.
 * 
 * Special thanks to Laiyart for the idea.
 */


// Reserved keywords that may become localizable in future versions.
const keywords = {
  randomImg: "random", 
  timerNamespace: "timer", 
  pauseTimer: "pause", 
  resumeTimer: "resume", 
  resetTimer: "reset"
};

// Strings to display as text overlay in specific scenarios.
const notifications = {
  paused: "P A U S E D"
};

let triggerPhrase;                  // Command text with appended whitespace.
let isUsableByEveryone;             // If true, everyone can trigger the widget.
let isUsableByMods;
let otherUsers;                     // Those users can trigger the widget, too.
let isTimerActivated;               // True if time interval > 0 minutes.

let intervalId = null;              // Used by the update mechanism of the timer.
let isBlocked = true;               // Blocks the widget when busy.


// Promisifies the EventListener for 'transitionend' (opacity transition).
function fadeTo(elmnt, amount) {
  return new Promise((resolve, reject) => {
    if (elmnt.style.opacity != amount) {
      elmnt.addEventListener('transitionend', () => {
        resolve(true);
      }, {once: true});
      
      elmnt.style.opacity = amount;
    } else {
      resolve(false);
    }
  });
}


// Representation of the #img-layer HTML element.
const imgSlot = {
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
      await fadeTo(this.container, 0);
      this.container.removeChild(this.img);
    }
    
    this.img = await this.createImg(url);
    this.container.appendChild(this.img);
    
    await fadeTo(this.container, 1);
    
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


function initializeImgSlot(urlArr, isDifferentImgEnforced, hasFullCycleRepetition) {
  imgSlot.urlPool = [...urlArr];
  
  // This mode enforces cycling through all URLs before repeating.
  if (hasFullCycleRepetition) {
    imgSlot.urlPool_remaining = [];
    
    imgSlot.supplyPool = function() {
      // Reset pool if empty.
      if (!this.urlPool_remaining.length) {
        this.urlPool_remaining = [...this.urlPool];
      }
      
      return this.urlPool_remaining;
    };
    
    imgSlot.applyAftermath = function(newUrl) {
      // Remove new URL from the pool.
      this.urlPool_remaining = 
          this.urlPool_remaining.filter((url) => (url !== newUrl));
    };
  }
  
  if (isDifferentImgEnforced) {
    imgSlot.pickUrl = function(arr) {
      // Get current URL and temporarily remove it from the pool, then pick.
      const oldUrl = (this.img) ? this.img.src : undefined;
      const cpArr = arr.filter((url) => (url !== oldUrl));
      
      return this.getRandomElement(cpArr);
    };
  }
  
  imgSlot.displayRandomImg();
}


// Representation of the #overlay HTML element.
const overlay = {
  container: document.getElementById("overlay"), 
  displayMode: 'none',              // Says what is currently displayed.
  
  // Fades the overlay out and deletes all subelements.
  async clearSubelmnts() {
    if (this.displayMode !== 'none') {
      await fadeTo(this.container, 0);
      
      this.container.innerHTML = "";
      this.displayMode = 'none';
    }
  }, 
  
  // Encapsulates fading-out, creating text element, fading-in.
  async displayText(str) {
    await this.clearSubelmnts();
    
    const elmnt = document.createElement('span');
    elmnt.innerText = str;
    this.container.appendChild(elmnt);
    
    await fadeTo(this.container, 1);
  }, 
  
  async displayPauseText() {
    if (this.displayMode !== 'paused') {
      await this.displayText(notifications.paused);
      
      this.displayMode = 'paused';
    }
  }
};


// Load google font by name and use it for given element.
function addGoogleFont(elmnt, fontName) {
  const fontLink = document.createElement('link');
  fontLink.href = 
      `https://fonts.googleapis.com/css2?family=${fontName.replaceAll(" ", "+")}`;
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);
  
  elmnt.style.fontFamily = fontName;
}


function initializeTimer(minutes, fontName, isVisible, padWithZeros, margins) {
  const timerElmnt = document.getElementById("timer");
  
  isTimerActivated = (minutes > 0);
  
  // If visible, style the timer.
  if (isVisible && isTimerActivated) {
    addGoogleFont(timerElmnt, fontName);
    
    if (margins) {
      timerElmnt.style.marginTop = `${margins.top ?? 0}px`;
      timerElmnt.style.marginRight = `${margins.right ?? 0}px`;
      timerElmnt.style.marginBottom = `${margins.bottom ?? 0}px`;
      timerElmnt.style.marginLeft = `${margins.left ?? 0}px`;
    }
    
    if (padWithZeros) {
      timer.formatUnit = function(n) {
        return (n < 10) ? ("0" + n) : n.toString();
      };
    }
    
  } else {
    timerElmnt.style.display = "none";
  }
  
  timer.startVals.hour = Math.trunc(minutes / 60);
  timer.startVals.minute = minutes % 60;
  timer.startVals.second = 0;
  
  timer.reset();
  
  timerElmnt.style.opacity = 1;
}


// Handles presentation of the values and time progression.
const timer = {
  container: document.getElementById("timer"), 
  subelmnts: {
    hour: document.getElementById("hour-slot"), 
    hourSep: document.getElementById("hour-sep"), 
    minute: document.getElementById("minute-slot"), 
    minuteSep: document.getElementById("minute-sep"), 
    second: document.getElementById("second-slot")
  }, 
  startVals: {},                    // Original interval time, preserved for reset.
  currentVals: {},                  // Tracks the remaining time.
  
  decideAboutHourSlot() {
    if (this.subelmnts.hour) {
      const val = (this.currentVals.hour > 0) ? "unset" : "none";
      
      this.subelmnts.hour.style.display = val;
      this.subelmnts.hourSep.style.display = val;
    }
  }, 
  
  // Can be overwritten, to change the presentation of time units.
  formatUnit(n) {
    return n.toString();
  }, 
  
  // Changes displayed value for the hour element.
  updateHourElmnt() {
    this.subelmnts.hour.innerHTML = this.formatUnit(this.currentVals.hour);
  }, 
  
  updateMinuteElmnt() {
    this.subelmnts.minute.innerHTML = this.formatUnit(this.currentVals.minute);
  }, 
  
  updateSecondElmnt() {
    this.subelmnts.second.innerHTML = this.formatUnit(this.currentVals.second);
  }, 
  
  setTime(hour, minute, second) {
    this.currentVals.hour = hour;
    this.updateHourElmnt();
    
    this.currentVals.minute = minute;
    this.updateMinuteElmnt();
    
    this.currentVals.second = second;
    this.updateSecondElmnt();
    
    this.decideAboutHourSlot();
  }, 
  
  reset() {
    this.setTime(
        this.startVals.hour, this.startVals.minute, this.startVals.second);
  }, 
  
  // Checks if the timer has reached its end state.
  hasReachedGoal() {
    return (this.currentVals.hour <= 0) && 
           (this.currentVals.minute <= 0) && 
           (this.currentVals.second <= 0);
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
  }
};


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


function initializeAudioAlert(url, vol) {
  audioAlert.url = url;
  audioAlert.normalizedVol = vol / 100;
}


// Stops the interval that drives the timer.
function stopInterval() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}


// Convenience function. 
function haltTimerUpdate() {
  stopInterval();
  
  return overlay.displayPauseText();
}


// Starts the interval that drives the timer.
async function resumeTimerUpdate() {
  // Clear any overlays (like text).
  await overlay.clearSubelmnts();
  
  if (isTimerActivated && !intervalId) {
    const func = () => {
      // If decreasing isn't possible anymore, goal is reached.
      if (!timer.decrease()) {
        stopInterval();
        
        trigger.release();
      }
    }
    
    intervalId = setInterval(func, 1000);
    
    // Imitates an immediate interval start (inspired by stackoverflow).
    //func();
  }
}


// Phasing is realized as Finite State Machine.
const trigger = {
  initialState: null,               // Held to reset the trigger later on.
  currState: null,                  // Points to the next state.
  
  // One-step trigger, for regular operation. Also used by buttons and commands.
  async fire_1Phased(func) {
    audioAlert.play();
    
    /* The func() approach was chosen to make it usable by both, random and 
     * index-based image changes. */
    await Promise.all([
        overlay.clearSubelmnts(), 
        func()
    ]);
    
    this.concludePhasing();
  }, 
  
  // Two-step trigger, for "paused after alert" mode (aka "giveaway" mode).
  async fire_2Phased_1() {
    audioAlert.play();
    
    await haltTimerUpdate();
    
    // Points to next state.
    this.currState = this.fire_2Phased_2;
  }, 
  
  async fire_2Phased_2(func) {
    // See fire_1Phased() for an explanation regarding func().
    await Promise.all([
        overlay.clearSubelmnts(), 
        func()
    ]);
    
    this.concludePhasing();
    
    // Points to next state.
    this.currState = this.fire_2Phased_1;
  }, 
  
  // Shared by all phasing functions to prepare the widget for next event.
  async concludePhasing() {
    timer.reset();
    this.reset();
    
    await resumeTimerUpdate();
  }, 
  
  // At this point, release() leads everytime to a random image change.
  release() {
    return this.currState(() => imgSlot.displayRandomImg());
  }, 
  
  // In case subsequent steps should be discarded.
  reset() {
    this.currState = this.initialState;
  }
};


function initializeTrigger(isPausedAfterAlert) {
  // Two-step trigger mode.
  if (isPausedAfterAlert) {
    trigger.initialState = trigger.fire_2Phased_1;
    
  // One-step trigger mode.
  } else {
    trigger.initialState = trigger.fire_1Phased;
  }
  
  trigger.reset();
}


// Uses the input of a media field to test whether media was added to it.
function isMediaFieldPopulated(input) {
  return (input && (Array.isArray(input) ? (input.length > 0) : true));
}


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


function onWidgetLoad(obj) {
  const fieldData = obj.detail.fieldData;
  
  // Makes it easier to look up the widget version for the user.
  console.log(`Initialize ${fieldData.widgetName} (v${fieldData.widgetVersion}).`);
  
  if (!isMediaFieldPopulated(fieldData.imgPool)) {
    console.log("Deactivate widget: empty image pool.");
    return;
  }
  
  if (fieldData.isDifferentImgEnforced && (fieldData.imgPool.length < 2)) {
    console.log(
        "Deactivate widget: image pool too small to enforce different images.");
    return;
  }
  
  triggerPhrase = fieldData.commandText.toLowerCase() + " ";
  
  isUsableByEveryone = (fieldData.permissionLvl === 'everyone');
  isUsableByMods = (fieldData.permissionLvl === 'mods');
  
  otherUsers = fieldData.otherUsers
      .toLowerCase()
      .replace(/\s/g, '')
      .split(",");
  
  initializeImgSlot(
      fieldData.imgPool, 
      fieldData.isDifferentImgEnforced , 
      fieldData.hasFullCycleRepetition);
  
  const timerMargins = {
    top: fieldData.timerMargin_top, 
    right: fieldData.timerMargin_right, 
    bottom: fieldData.timerMargin_bottom, 
    left: fieldData.timerMargin_left
  };
  
  initializeTimer(
      fieldData.triggerInterval, 
      fieldData.timerFontFamily, 
      (fieldData.timerVisibility === 'visible'), 
      fieldData.isNumberPaddedWithZero, 
      timerMargins);
  
  initializeAudioAlert(
      fieldData.audioAlert_url, 
      fieldData.audioAlert_vol);
  
  initializeTrigger(fieldData.isPausedAfterAlert);
  
  if (fieldData.testMode === 'on') {
    activateTestMode(fieldData.hasColorizedSegments);
  }
  
  if (fieldData.isInitiallyPaused) {
    haltTimerUpdate();
  } else {
    resumeTimerUpdate();
  }
  
  isBlocked = false;
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


// Executes the actions associated with the keywords.
async function interpretKeywords(args) {
  // Separate timer commands in their own namespace (e.g. "!img timer reset").
  if (args[0] === keywords.timerNamespace) {
    if (args[1] === keywords.pauseTimer) {
      await haltTimerUpdate();
      
    } else if (args[1] === keywords.resumeTimer) {
      await resumeTimerUpdate();
      
    } else if (args[1] === keywords.resetTimer) {
      timer.reset();
      
    // Try to interpret the argument as a duration.
    } else if (args[1]) {
      const units = args[1]
          .split(":")
          .map((str) => Math.abs(str));
      
      // Indexes greater or equal than this are for minute or second values.
      const minuteIndex = units.length - 3;
      
      for (let i = 0; i < units.length; i++) {
        if (isNaN(units[i])) {
          return;
        }
        
        // Minutes and seconds cannot be greater than 59.
        if ((i > minuteIndex) && (units[i] > 59)) {
          units[i] = 59;
        }
      }
      
      timer.setTime(
          (units.at(-3) || 0),          // hours
          (units.at(-2) || 0),          // minutes
          (units.at(-1) || 0));         // seconds
    }
    
  } else if (args[0] === keywords.randomImg) {
    stopInterval();
    
    await trigger.fire_1Phased(() => imgSlot.displayRandomImg());
    
  // Try to interpret the argument as an index in the image pool.
  } else if (args[0]) {
    /* Strings that don't represent a valid number should result in 'NaN'. Any 
     * floating point part is ignored. */
    const n = parseInt(args[0]);
    
    if (!isNaN(n) && (n >= 1) && (n <= imgSlot.urlPool.length)) {
      stopInterval();
      
      await trigger.fire_1Phased(() => imgSlot.displayImg(n - 1));
    }
  }
}


async function onMessage(msg) {
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
    
    isBlocked = true;
    
    /* Now that it's established that the chat message begins with the trigger 
     * phrase and that the user is allowed to use the command, the whole message 
     * can be processed. The trigger phrase is cut off, to allow for white space 
     * in it. */
    const args = parseArgs(
        msg.text
            .substring(triggerPhrase.length)
            .toLowerCase());
    
    // Less than 1 arg means a syntactical error.
    if (args.length >= 1) {
      await interpretKeywords(args);
    }
    
    isBlocked = false;
  }
}


// Executes the actions associated with the buttons.
async function interpretButtons(name) {
  if (name === 'randomImgButton') {
    stopInterval();
    
    await trigger.fire_1Phased(() => imgSlot.displayRandomImg());
    
  } else if (name === 'pauseButton') {
    if (!intervalId) {
      await resumeTimerUpdate();
    } else {
      await haltTimerUpdate();
    }
    
  } else if (name === 'resetButton') {
    timer.reset();
  }
}


// Triggered by the UI buttons in the overlay editor.
async function onWidgetButton(data) {
  if (isBlocked) {
    //console.log("Widget is currently blocked. (Button)");
    return;
  }
  
  isBlocked = true;
  
  await interpretButtons(data.field);
  
  isBlocked = false;
}


// If the widget is about to get closed, kill the interval.
window.addEventListener("beforeunload", function() {
  stopInterval();
});
