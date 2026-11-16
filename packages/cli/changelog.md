# Changelog

## 0.1.0 (2026-11-16)


### ⚠ BREAKING CHANGES

* **cli:** rename AnalyzeOptions to AnalyzeFileOptions, and say why decodedLimit is exported
* **cli:** name the engine option --engine and the MCP argument engine
* **cli:** candidates are {bpm, relation} where they were {tempo, count}, in the CLI JSON output, the CLI API and the MCP outputSchema.

### Features

* **cli,mcp:** report the whole v6 reading, and follow the library's default engine ([2a7bd70](https://github.com/dlepaux/realtime-bpm-analyzer/commit/2a7bd70f921ea2c8b11ab5237a084bd4c07f5175))
* **cli:** add --detector peaks or tempogram ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **cli:** add the realtime-bpm-analyzer-cli package ([#278](https://github.com/dlepaux/realtime-bpm-analyzer/issues/278)) ([26813bf](https://github.com/dlepaux/realtime-bpm-analyzer/commit/26813bf9bc801ce7c0e2f741d478aff4c3a92b0f))
* **cli:** name the engine option --engine and the MCP argument engine ([c2958e3](https://github.com/dlepaux/realtime-bpm-analyzer/commit/c2958e33110ddf3ec114cc94ab875cf8acfb39b4))
* **cli:** report the v6 reading in the JSON output and the MCP schema ([cb8b8a0](https://github.com/dlepaux/realtime-bpm-analyzer/commit/cb8b8a0976aec77e96e2999493bc810becaa1ccd))
* **mcp:** add the detector argument ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **mcp:** add the realtime-bpm-analyzer-mcp server ([#281](https://github.com/dlepaux/realtime-bpm-analyzer/issues/281)) ([34f00d3](https://github.com/dlepaux/realtime-bpm-analyzer/commit/34f00d3734dfebf471f694a1ae6e07cc50f676df))
* **realtime:** add BpmAnalyzer.input, the node to connect a source to with either detector ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **realtime:** add tempogramMode 'extension', which refuses any option that would leave those settings, for a browser extension listening to a tab ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))
* **realtime:** add the opt-in tempogram detector's locked settings, searching 90 to 180 BPM on real-time audio and whole files, where a tempo over 180 reads half ([8dab6e1](https://github.com/dlepaux/realtime-bpm-analyzer/commit/8dab6e129db685cc4c94368831385533a0b0862f))


### Bug Fixes

* **api:** settle v6's public names and docs before 6.1.0 freezes them ([0101d5c](https://github.com/dlepaux/realtime-bpm-analyzer/commit/0101d5c30097709a467d1f620b96c89d15acf578))
* **cli,mcp:** bound the work one file costs before the first publish ([#311](https://github.com/dlepaux/realtime-bpm-analyzer/issues/311)) ([348defe](https://github.com/dlepaux/realtime-bpm-analyzer/commit/348defe6a7397dc42b94ac7d99743bfed88d6b2b))
* **cli,mcp:** close the [#311](https://github.com/dlepaux/realtime-bpm-analyzer/issues/311) review follow-ups before the first publish ([#312](https://github.com/dlepaux/realtime-bpm-analyzer/issues/312)) ([169e17b](https://github.com/dlepaux/realtime-bpm-analyzer/commit/169e17be554be61e82bad0595ba39aa339df1fe7))
* **cli,mcp:** raise the Node floor to 22.12.0, and check the progress the MCP server sent (RBA-241) ([a911538](https://github.com/dlepaux/realtime-bpm-analyzer/commit/a911538714ee85f1afef860620032412dfc85222))
* **cli,mcp:** raise the Node floor to 22.12.0, since 22.0.0's worker teardown can deadlock a long-lived host ([9014396](https://github.com/dlepaux/realtime-bpm-analyzer/commit/90143968d1b9cc8d5bbe557846a40bc5f6aabae1))
* **cli:** bound decoded audio, not file size, on every decoder path ([#292](https://github.com/dlepaux/realtime-bpm-analyzer/issues/292)) ([9a71c50](https://github.com/dlepaux/realtime-bpm-analyzer/commit/9a71c50318b53cb874ea6e2aecc36f12a892c9cc))
* **cli:** let the host alone end the analysis worker, and bound every Node test and CI job (RBA-241) ([ca5d1de](https://github.com/dlepaux/realtime-bpm-analyzer/commit/ca5d1de8e24238597e2bd50722ce4d5a0e2b85e5))
* **cli:** let the host alone end the analysis worker, since a terminate landing during the worker's own exit deadlocked its teardown on Node 22.0.0 and the CLI never exited (RBA-241) ([5bb1808](https://github.com/dlepaux/realtime-bpm-analyzer/commit/5bb1808c7db5ff4e5a631b6ec04da65b40e8c4dc))
* **confidence:** give null on any custom tempo range, since the tables were fitted only on 90 to 180 ([ad1804d](https://github.com/dlepaux/realtime-bpm-analyzer/commit/ad1804dfa2410018135136710c5c068db0cdda38))
* **confidence:** null on any custom tempo range, and main with [#400](https://github.com/dlepaux/realtime-bpm-analyzer/issues/400) into v6 ([47f488b](https://github.com/dlepaux/realtime-bpm-analyzer/commit/47f488bf50c3ae1a8e8eb15d6ea98df09d90a061))
* **confidence:** say on each range input that another range gives null, and pin a test to a number ([b144b91](https://github.com/dlepaux/realtime-bpm-analyzer/commit/b144b915b33e82fc1e4851c947eacb274f58ec2d))
* **engine:** refuse unknown engine keys, and the release review's can-follows 1 to 5 (RBA-108) ([b982801](https://github.com/dlepaux/realtime-bpm-analyzer/commit/b982801cccce62c637b50c43188ec03d3d471f0e))
* fold the Show HN audit's fix list into v6 (RBA-228) ([58ed033](https://github.com/dlepaux/realtime-bpm-analyzer/commit/58ed033fec81d90aeedb105ce365d13eb68266d6))
* give v6's lowpass settings one shape, test the Node floor and polish the docs before 6.1.0 (RBA-228) ([06c5e22](https://github.com/dlepaux/realtime-bpm-analyzer/commit/06c5e2262d1b197eca60ccfe1cfe209ed8ace230))
* **packaging:** lower the CLI's and MCP server's Node floor to 22, the oldest maintained LTS ([34f2267](https://github.com/dlepaux/realtime-bpm-analyzer/commit/34f2267e436d7f2bbd81fe623e3e72f874462365))
* **packaging:** publish v6's three packages with the README, one bin and a tested Node floor ([799d484](https://github.com/dlepaux/realtime-bpm-analyzer/commit/799d484af8ccce652cac49e8d29a374f0c2802f3))
* **reading:** answer the review: pin null over 180 end to end, and true messages and docs ([49bce71](https://github.com/dlepaux/realtime-bpm-analyzer/commit/49bce71bfb855b195c7872d9e441ca65576429f0))
* **reading:** claim nothing unmeasured about custom ranges, and one reason per refusal ([3076d77](https://github.com/dlepaux/realtime-bpm-analyzer/commit/3076d77470d86ad83fd4998d9e98d6b4d96546a8))
* **reading:** null confidence outside the measured range, and strict options (RBA-108) ([4553c7b](https://github.com/dlepaux/realtime-bpm-analyzer/commit/4553c7b29beee74889a427087e464879e64601b4))
* **reading:** null confidence outside the measured range, and strict options, before v6 freezes ([86e258d](https://github.com/dlepaux/realtime-bpm-analyzer/commit/86e258da13462751156401ec2551623127fed2ae))
* **release:** move the CLI and MCP ranges with the library in one release PR ([e1a0472](https://github.com/dlepaux/realtime-bpm-analyzer/commit/e1a0472ad3888385a989a56a5260deb687dfcebb))


### Code Refactoring

* **cli:** rename AnalyzeOptions to AnalyzeFileOptions, and say why decodedLimit is exported ([1b04975](https://github.com/dlepaux/realtime-bpm-analyzer/commit/1b049754e7f9aae3a7ec93dd78f09e8c363ca005))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * realtime-bpm-analyzer bumped from ^5.6.0 to ^6.1.0
