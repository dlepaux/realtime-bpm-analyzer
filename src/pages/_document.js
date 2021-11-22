import React from 'react';
import {Document, Script} from 'next';

class MyDocument extends Document {
  static async getInitialProps(context) {
    const initialProps = await Document.getInitialProps(context);
    return {...initialProps};
  }

  render() {
    return (
      <Document.Html>
        <Document.Head>
          <meta charset="utf-8"/>
          <meta httpEquiv="X-UA-Compatible" content="IE=edge"/>
          <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
          <link rel="icon" href="/favicon.png"/>
          <title>Realtime Bpm Analyzer</title>

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
        </Document.Head>
        <body>
          <Document.Main/>
          <Document.NextScript/>
        </body>
      </Document.Html>
    );
  }
}

export default MyDocument;
