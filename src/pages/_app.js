import React from 'react';
import PropTypes from 'prop-types';

/**
 * Highlight
 */
import 'highlight.js/styles/github-dark-dimmed.css';

import '../styles.scss';
import Layout from '../components/layout.js';

const App = ({Component, pageProps}) => (
  <div id="app" className="d-flex flex-column">
    <Layout>
      <Component {...pageProps}/>
    </Layout>
  </div>
);

App.propTypes = {
  Component: PropTypes.any.isRequired,
  pageProps: PropTypes.any.isRequired,
};

export default App;
