import Navbar from './navbar'
import Footer from './footer'

export default function Layout({ children }) {
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
  )
}
