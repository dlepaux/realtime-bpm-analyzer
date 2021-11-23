import React from 'react';
import PropTypes from 'prop-types';

import Navbar from './navbar.js';
import Footer from './footer.js';

const Layout = ({children}) => (
  <>
    <Navbar/>
    <div className="d-flex flex-grow-1 flex-column">
      <div className="flex-grow-1">
        <main>{children}</main>
      </div>
      <Footer/>
    </div>
  </>
);

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
