import React from 'react';
import Document, {Html, Head, Main, NextScript} from 'next/document.js';
import Script from 'next/script.js';

class MyDocument extends Document {
  static async getInitialProps(context) {
    const initialProps = await Document.getInitialProps(context);
    return {...initialProps};
  }

  render() {
    return (
      <Html>
        <Head>
          <link rel="icon" href={`${process.env.PREFIX_URL}/favicon.png`}/>

          {/* Global site tag (gtag.js) - Google Analytics */}
          <Script
            async
            src="https://www.googletagmanager.com/gtag/js?id=G-PXQ4D05F0B"
            onLoad={() => {
              window.dataLayer = window.dataLayer || [];

              function gtag() {
                window.dataLayer.push(arguments);
              }

              gtag('js', new Date());
              gtag('config', 'G-PXQ4D05F0B');
            }}/>
        </Head>
        <body>
          <Main/>
          <NextScript/>
        </body>
      </Html>
    );
  }
}

export default MyDocument;
