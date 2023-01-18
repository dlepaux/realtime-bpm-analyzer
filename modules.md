[realtime-bpm-analyzer](README.md) / Exports

# realtime-bpm-analyzer

## Table of contents

### Classes

- [RealTimeBpmAnalyzer](classes/RealTimeBpmAnalyzer.md)

### Type Aliases

- [BpmCandidates](modules.md#bpmcandidates)
- [Interval](modules.md#interval)
- [NextIndexPeaks](modules.md#nextindexpeaks)
- [OnThresholdFunction](modules.md#onthresholdfunction)
- [Peaks](modules.md#peaks)
- [PeaksAndThreshold](modules.md#peaksandthreshold)
- [RealTimeBpmAnalyzerOptions](modules.md#realtimebpmanalyzeroptions)
- [RealTimeBpmAnalyzerParameters](modules.md#realtimebpmanalyzerparameters)
- [Tempo](modules.md#tempo)
- [Threshold](modules.md#threshold)
- [ValidPeaks](modules.md#validpeaks)

### Functions

- [analyzeFullBuffer](modules.md#analyzefullbuffer)
- [createRealTimeBpmProcessor](modules.md#createrealtimebpmprocessor)

## Type Aliases

### BpmCandidates

Ƭ **BpmCandidates**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `bpm` | [`Tempo`](modules.md#tempo)[] |
| `threshold` | [`Threshold`](modules.md#threshold) |

#### Defined in

[types.ts:13](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L13)

___

### Interval

Ƭ **Interval**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `count` | `number` |
| `interval` | `number` |

#### Defined in

[types.ts:18](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L18)

___

### NextIndexPeaks

Ƭ **NextIndexPeaks**: `Record`<`string`, `number`\>

#### Defined in

[types.ts:41](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L41)

___

### OnThresholdFunction

Ƭ **OnThresholdFunction**: (`threshold`: [`Threshold`](modules.md#threshold)) => `Promise`<`boolean`\>

#### Type declaration

▸ (`threshold`): `Promise`<`boolean`\>

##### Parameters

| Name | Type |
| :------ | :------ |
| `threshold` | [`Threshold`](modules.md#threshold) |

##### Returns

`Promise`<`boolean`\>

#### Defined in

[types.ts:43](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L43)

___

### Peaks

Ƭ **Peaks**: `number`[]

#### Defined in

[types.ts:6](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L6)

___

### PeaksAndThreshold

Ƭ **PeaksAndThreshold**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `peaks` | [`Peaks`](modules.md#peaks) |
| `threshold` | [`Threshold`](modules.md#threshold) |

#### Defined in

[types.ts:8](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L8)

___

### RealTimeBpmAnalyzerOptions

Ƭ **RealTimeBpmAnalyzerOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `computeBpmDelay` | `number` |
| `continuousAnalysis` | `boolean` |
| `stabilizationTime` | `number` |

#### Defined in

[types.ts:34](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L34)

___

### RealTimeBpmAnalyzerParameters

Ƭ **RealTimeBpmAnalyzerParameters**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `computeBpmDelay?` | `number` |
| `continuousAnalysis?` | `boolean` |
| `stabilizationTime?` | `number` |

#### Defined in

[types.ts:28](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L28)

___

### Tempo

Ƭ **Tempo**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `count` | `number` |
| `tempo` | `number` |

#### Defined in

[types.ts:23](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L23)

___

### Threshold

Ƭ **Threshold**: `number`

#### Defined in

[types.ts:1](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L1)

___

### ValidPeaks

Ƭ **ValidPeaks**: `Record`<`string`, [`Peaks`](modules.md#peaks)\>

#### Defined in

[types.ts:40](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/types.ts#L40)

## Functions

### analyzeFullBuffer

▸ **analyzeFullBuffer**(`buffer`): `Promise`<`number`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `buffer` | `AudioBuffer` |

#### Returns

`Promise`<`number`\>

#### Defined in

[offline-bpm-analyzer.ts:6](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/offline-bpm-analyzer.ts#L6)

___

### createRealTimeBpmProcessor

▸ **createRealTimeBpmProcessor**(`audioContext`): `Promise`<`AudioWorkletNode`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `audioContext` | `AudioContext` |

#### Returns

`Promise`<`AudioWorkletNode`\>

#### Defined in

[index.ts:14](https://github.com/dlepaux/realtime-bpm-analyzer/blob/c6f2d84/src/index.ts#L14)
