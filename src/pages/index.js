import {Head, Link} from 'next';
import React from 'react';
import Highlight from 'react-highlight';
import {Container} from 'react-bootstrap';

import * as consts from '../consts.js';

const HomePage = () => (
  <>
    <Head>
      <title>Realtime Bpm Analyzer</title>
      <meta name="description" content="Example using the Realtime BPM Analyzer on an audio node."/>
    </Head>
    <Container className="pb-3">
      <p className="text-center">
        <img src="/img/allegro-project-transparent.png" className="img-fluid"/>
      </p>

      <h2>Installation</h2>
      <Highlight language="bash" className="bash">
        {consts.installationCommand}
      </Highlight>

      <h2>Usage</h2>
      <div>
        <p>1. An AudioNode to analyze. So something like this :</p>
        <Highlight language="xml" className="ms-3 xml">
          {consts.usageStepOne}
        </Highlight>

        <p>2. Connect the AudioNode to the AudioContext and create an AudioContext.createScriptProcessor().</p>
        <Highlight language="js" className="ms-3 javascript">
          {consts.usageStepTwo}
        </Highlight>

        <p>3. Now you have just to configure the tool and attach it to the audioprocess event like this :</p>
        <Highlight language="js" className="ms-3 javascript">
          {consts.usageStepThree}
        </Highlight>
      </div>

      <h2 className="mt-3">Examples</h2>

      <div>
        Please check the examples in this website and the <Link href="/how-it-works"><a>How it works</a></Link> page.<br/>
        You can as well check <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/src/views/routes">the code base</a> of the github pages to see how to use the library for those specific cases.
      </div>

      <h2 className="mt-3">Contribution, Community & Support</h2>
      <p>
        Please ensure to aknowledge the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/contributing.md">contribution guide lines</a> and <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/code-of-conduct.md">code of conduct</a>.
      </p>

      <p>
        Once you&apos;ve read the document mentioned above, don&apos;t hesitate to <a href="https://gitter.im/realtime-bpm-analyzer/Lobby">chat with the community</a> or <a href="https://github.com/dlepaux/realtime-bpm-analyzer/issues">submit an issue</a>.
      </p>

      <h2 className="mt-3">Changelog</h2>
      <p>
        See the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/changelog.md">changelog</a>.
      </p>

      <h2 className="mt-3">Licence</h2>
      <p>
        This project is under <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/licence.md">MIT licence</a>.
      </p>

      <h2 className="mt-3">Credits</h2>
      <p>
        This library was been inspired from <a href="https://github.com/tornqvist/bpm-detective">Tornqvist</a> project which also based on <a href="http://joesul.li/van/beat-detection-using-web-audio/">Joe Sullivan&apos;s algorithm</a>. Thank you to both of them.
      </p>

      <h2 className="mt-3">Final</h2>
      <p>
        If this helped you in any way, you can always leave me a tip here :)
        <br/>
        BTC <strong>36eHnxCRUDfWNFEx3YebRGw12WeutjkBBt</strong>
        <br/>
        ETH <strong>0x0F8b4F026624150e9F6267bFD93C372eb98e3010</strong>
      </p>
    </Container>
  </>
);

export default HomePage;
