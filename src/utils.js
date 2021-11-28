/**
 * Utils Singletron
 * @class
 */
class Utils {
  /**
   * Loop between .9 and .3 to check peak at each thresolds
   * @param {function} onLoop Function for each iteration
   * @param {mixed} minValidThresold Function for each iteration
   * @param {mixed} callback Function executed at the end
   */
  loopOnThresolds(onLoop, minValidThresold, callback) {
    /**
     * Top starting value to check peaks
     * @type {number}
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

    if (typeof callback !== 'function') {
      callback = this.noop;
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
    return callback(object);
  }

  /**
   * Generate an object with each keys (thresolds) with a defaultValue
   * @param  {mixed} defaultValue Contain the înitial value for each thresolds
   * @param  {function} callback Callback function
   * @return {object} Object with thresolds key initialized with a defaultValue
   */
  generateObjectModel(defaultValue, callback) {
    return this.loopOnThresolds((object, thresold) => {
      object[thresold.toString()] = JSON.parse(JSON.stringify(defaultValue));
    }, object => {
      if (callback) {
        return callback(JSON.parse(JSON.stringify(object)));
      }

      return object;
    });
  }

  /**
   * Empty method
   */
  noop() {}
}

export default new Utils();
