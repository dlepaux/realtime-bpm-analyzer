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
  Component: PropTypes.element,
  pageProps: PropTypes.object,
};

export default App;
