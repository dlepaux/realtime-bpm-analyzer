const commitlint = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0, 'never'],  // Disable the line length check
  },
};

module.exports = commitlint;
