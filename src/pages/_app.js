/**
 * Highlight
 */
import 'highlight.js/styles/github-dark-dimmed.css';

// import App from 'next/app'
import '../styles.scss';
import Layout from '../components/layout';

function MyApp({Component, pageProps}) {
  return (
    <div id="app" class="d-flex flex-column">
      <Layout>
        <Component {...pageProps}/>
      </Layout>
    </div>
  );
}

// Only uncomment this method if you have blocking data requirements for
// every single page in your application. This disables the ability to
// perform automatic static optimization, causing every page in your app to
// be server-side rendered.
//
// MyApp.getInitialProps = async (appContext) => {
//   // calls page's `getInitialProps` and fills `appProps.pageProps`
//   const appProps = await App.getInitialProps(appContext);
//
//   return { ...appProps }
// }

export default MyApp
