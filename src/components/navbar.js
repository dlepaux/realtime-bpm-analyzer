import React from 'react';
import {Nav, NavDropdown, Navbar, Container} from 'react-bootstrap';

import GithubCorner from './github-corner.js';

export default class extends React.Component {
  render() {
    return (
      <>
        <Navbar bg="dark" style={{backgroundColor: '#2d333b !important'}} variant="dark" expand="sm">
          <Container fluid>
            <Navbar.Brand href={`${process.env.PREFIX_URL}/`}>
              <img
                alt=""
                src={`${process.env.PREFIX_URL}/favicon.png`}
                width="30"
                height="30"
                className="d-inline-block align-top"
              />{' '}
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav"/>
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link href={`${process.env.PREFIX_URL}/api/v3/index.html`}>API Documentation</Nav.Link>
                <NavDropdown title="Examples" menuVariant="dark" id="basic-nav-dropdown">
                  <NavDropdown.Item href={`${process.env.PREFIX_URL}/audio-node`}>Audio Node</NavDropdown.Item>
                  <NavDropdown.Item href={`${process.env.PREFIX_URL}/user-media`}>User Media</NavDropdown.Item>
                  <NavDropdown.Item href={`${process.env.PREFIX_URL}/stream`}>Stream</NavDropdown.Item>
                </NavDropdown>
                <Nav.Link href={`${process.env.PREFIX_URL}/how-it-works`}>How it works</Nav.Link>
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>
        <GithubCorner/>
      </>
    );
  }
}
