'use strict';

/**
 * Function container
 * @type {Object}
 */

const utils = {};



/**
 * Loop between .9 and .3 to check peak for each thresolds
 * @param  {Function} onLoop   Function for each iteration
 * @param  {Function} callback Function executed at the end
 * @return {Mixed}             Return of 'callback' function
 */

utils.loopOnThresolds = function (onLoop, minValidThresold, callback) {
  /**
   * Top starting value to check peaks
   */

  let thresold = 0.95;

  /**
   * Minimum value to check peaks
   */

  if (typeof minValidThresold === 'function' || typeof minValidThresold === 'boolean') {
    callback = minValidThresold || callback;
    minValidThresold = 0.3;
  }

  if (typeof minValidThresold === 'undefined') {
    minValidThresold = 0.3;
  }

  const minThresold = minValidThresold;

  /**
   * Optionnal object to store data
   */

  const object = {};

  /**
   * Loop between 0.90 and 0.30 (theoretically it is 0.90 but it is 0.899999, due because of float manipulation)
   */

  do {
    let stop = false;
    thresold -= 0.05;
    onLoop(object, thresold, bool => {
      stop = bool;
    });

    if (stop) {
      break;
    }
  } while (thresold > minThresold);

  /**
   * Ended callback
   */
  return callback && callback(object);
};



/**
 * Generate an object with each keys (thresolds) with a defaultValue
 * @param  {Mixed}  defaultValue Contain the înitial value for each thresolds
 * @return {Object}              Object with thresolds key initialized with a defaultValue
 */

utils.generateObjectModel = function (defaultValue, callback) {
  return utils.loopOnThresolds((object, thresold) => {
    object[thresold.toString()] = JSON.parse(JSON.stringify(defaultValue));
  }, object => {
    if (callback) {
      return callback(JSON.parse(JSON.stringify(object)));
    }

    return object;
  });
};



/**
 * Export utils function container
 */

module.exports = utils;
