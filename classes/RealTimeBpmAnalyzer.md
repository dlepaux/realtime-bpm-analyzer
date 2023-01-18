[realtime-bpm-analyzer](../README.md) / [Exports](../modules.md) / RealTimeBpmAnalyzer

# Class: RealTimeBpmAnalyzer

## Table of contents

### Constructors

- [constructor](RealTimeBpmAnalyzer.md#constructor)

### Properties

- [chunkCoeff](RealTimeBpmAnalyzer.md#chunkcoeff)
- [minValidThreshold](RealTimeBpmAnalyzer.md#minvalidthreshold)
- [nextIndexPeaks](RealTimeBpmAnalyzer.md#nextindexpeaks)
- [options](RealTimeBpmAnalyzer.md#options)
- [timeoutStabilization](RealTimeBpmAnalyzer.md#timeoutstabilization)
- [validPeaks](RealTimeBpmAnalyzer.md#validpeaks)

### Methods

- [analyzeChunck](RealTimeBpmAnalyzer.md#analyzechunck)
- [clearValidPeaks](RealTimeBpmAnalyzer.md#clearvalidpeaks)
- [findPeaks](RealTimeBpmAnalyzer.md#findpeaks)
- [reset](RealTimeBpmAnalyzer.md#reset)
- [setAsyncConfiguration](RealTimeBpmAnalyzer.md#setasyncconfiguration)

## Constructors

### constructor

• **new RealTimeBpmAnalyzer**(`config?`)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `config` | [`RealTimeBpmAnalyzerParameters`](../modules.md#realtimebpmanalyzerparameters) |  |

#### Defined in

[realtime-bpm-analyzer.ts:46](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L46)

## Properties

### chunkCoeff

• **chunkCoeff**: `number`

#### Defined in

[realtime-bpm-analyzer.ts:37](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L37)

___

### minValidThreshold

• **minValidThreshold**: `number`

#### Defined in

[realtime-bpm-analyzer.ts:21](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L21)

___

### nextIndexPeaks

• **nextIndexPeaks**: [`NextIndexPeaks`](../modules.md#nextindexpeaks)

#### Defined in

[realtime-bpm-analyzer.ts:33](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L33)

___

### options

• **options**: [`RealTimeBpmAnalyzerOptions`](../modules.md#realtimebpmanalyzeroptions)

#### Defined in

[realtime-bpm-analyzer.ts:17](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L17)

___

### timeoutStabilization

• **timeoutStabilization**: `string` \| `Timeout`

#### Defined in

[realtime-bpm-analyzer.ts:25](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L25)

___

### validPeaks

• **validPeaks**: [`ValidPeaks`](../modules.md#validpeaks)

#### Defined in

[realtime-bpm-analyzer.ts:29](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L29)

## Methods

### analyzeChunck

▸ **analyzeChunck**(`channelData`, `audioSampleRate`, `bufferSize`, `postMessage`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `channelData` | `Float32Array` |
| `audioSampleRate` | `number` |
| `bufferSize` | `number` |
| `postMessage` | (`data`: `any`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[realtime-bpm-analyzer.ts:108](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L108)

___

### clearValidPeaks

▸ **clearValidPeaks**(`minThreshold`): `void`

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `minThreshold` | `number` |  |

#### Returns

`void`

#### Defined in

[realtime-bpm-analyzer.ts:87](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L87)

___

### findPeaks

▸ **findPeaks**(`channelData`, `bufferSize`, `currentMinIndex`, `currentMaxIndex`): `void`

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `channelData` | `Float32Array` |  |
| `bufferSize` | `number` |  |
| `currentMinIndex` | `number` |  |
| `currentMaxIndex` | `number` |  |

#### Returns

`void`

#### Defined in

[realtime-bpm-analyzer.ts:161](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L161)

___

### reset

▸ **reset**(): `void`

#### Returns

`void`

#### Defined in

[realtime-bpm-analyzer.ts:75](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L75)

___

### setAsyncConfiguration

▸ **setAsyncConfiguration**(`key`, `value`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `key` | `string` |
| `value` | `unknown` |

#### Returns

`void`

#### Defined in

[realtime-bpm-analyzer.ts:63](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/realtime-bpm-analyzer.ts#L63)
