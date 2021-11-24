import React from 'react';
import PropTypes from 'prop-types';
import Head from 'next/head.js';

/**
 * Highlight
 */
import 'highlight.js/styles/github-dark-dimmed.css';

import '../styles.scss';
import Layout from '../components/layout.js';

const App = ({Component, pageProps}) => (
  <>
    <Head>
      <meta charSet="utf-8"/>
      <meta httpEquiv="X-UA-Compatible" content="IE=edge"/>
      <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <title>Realtime Bpm Analyzer</title>
    </Head>
    <div id="app" className="d-flex flex-column">
      <Layout>
        <Component {...pageProps}/>
      </Layout>
    </div>
  </>
);

App.propTypes = {
  Component: PropTypes.any.isRequired,
  pageProps: PropTypes.any.isRequired,
};

export default App;
