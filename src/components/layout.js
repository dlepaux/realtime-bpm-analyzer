import React from 'react';

import Navbar from './navbar.js';
import Footer from './footer.js';

export default class extends React.Component {
  render(children) {
    return (
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
  }
}
