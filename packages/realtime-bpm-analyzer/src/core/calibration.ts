import type {EngineName} from '../contract/types';

/**
 * RBA-106: maps each engine's raw score to the chance its reading is right (within 4% of the true tempo), so a
 * `Reading.confidence` of 0.8 is right about 80% of the time. Fitted on the benchmark's dev half only, under the
 * shipped HYSTERESIS: readings sampled at 10, 15, 20, 30 and 45 s and at the end of each track, so long tracks do
 * not weigh more. Results, method and ranges: benchmark/results/rba-106-calibration-dev.md. Not yet checked on
 * held-out data: that one check waits for a DECISION on RBA-106.
 *
 * Each table is [raw, calibrated] points with raw increasing and calibrated non-decreasing: read by linear
 * interpolation, flat past either end. A tempo band has its own table only where dev showed the shared one off
 * beyond the noise (benchmark/calibration.py fixed that rule before the data existed). Realtime and offline
 * readings share the tables: dev showed no gain from an offline one. These tables are data from the benchmark,
 * mirrored by benchmark/calibration.py's `apply_mapping`; regenerate them rather than edit them.
 */

/** [raw, calibrated] */
type Point = readonly [number, number];

type Band = 'under90' | 'from90' | 'from140' | 'from165';

type Mapping = {
  readonly all: readonly Point[];
  readonly bands: Readonly<Partial<Record<Band, readonly Point[]>>>;
};

/** The reading's own tempo picks the band: under 90, 90 to 140, 140 to 165, 165 and over */
function bandOf(bpm: number): Band {
  if (bpm < 90) {
    return 'under90';
  }

  if (bpm < 140) {
    return 'from90';
  }

  return bpm < 165 ? 'from140' : 'from165';
}

export const CALIBRATION: Readonly<Record<EngineName, Mapping>> = Object.freeze({
  tempogram: {
    all: [
      [0.028638, 0.20051], [0.055144, 0.372585], [0.097521, 0.575647], [0.149595, 0.635569],
      [0.20161, 0.690485], [0.249703, 0.72767], [0.295928, 0.762304], [0.341343, 0.765585],
      [0.385679, 0.799125], [0.429153, 0.835641], [0.470513, 0.845789], [0.511768, 0.869486],
      [0.553363, 0.884798], [0.595264, 0.895735], [0.638504, 0.910317], [0.681735, 0.915421],
      [0.725551, 0.919825], [0.772671, 0.936566], [0.825921, 0.944951], [0.89822, 0.951513],
    ],
    bands: {
      from140: [
        [0.033034, 0.33474], [0.070347, 0.6], [0.119277, 0.732771], [0.172728, 0.746835],
        [0.221609, 0.808451], [0.267829, 0.831224], [0.314113, 0.845288], [0.356172, 0.871921],
        [0.396377, 0.871921], [0.434812, 0.907042], [0.471061, 0.931083], [0.505789, 0.939479],
        [0.542801, 0.939479], [0.584486, 0.947257], [0.624045, 0.947257], [0.663255, 0.960563],
        [0.705149, 0.964838], [0.749939, 0.964838], [0.800818, 0.971147], [0.875589, 0.971147],
      ],
      from165: [
        [0.025208, 0.107843], [0.03957, 0.230392], [0.060399, 0.323529], [0.092567, 0.338235],
        [0.135659, 0.367647], [0.181557, 0.5], [0.223155, 0.5], [0.257036, 0.5],
        [0.290288, 0.5], [0.323952, 0.5], [0.358273, 0.519608], [0.396653, 0.607843],
        [0.434505, 0.644608], [0.473727, 0.644608], [0.518908, 0.671569], [0.562945, 0.720588],
        [0.60891, 0.735294], [0.668028, 0.77451], [0.745682, 0.872549], [0.853984, 0.872549],
      ],
    },
  },
  peaks: {
    all: [
      [0.049989, 0.185357], [0.063145, 0.222892], [0.072474, 0.267501], [0.08232, 0.352641],
      [0.093329, 0.44393], [0.105524, 0.544738], [0.116928, 0.613531], [0.130731, 0.671918],
      [0.145092, 0.692771], [0.161133, 0.753012], [0.177844, 0.798795], [0.19531, 0.81696],
      [0.214063, 0.830862], [0.233928, 0.855355], [0.257586, 0.890176], [0.283525, 0.914041],
      [0.315376, 0.914041], [0.349677, 0.923077], [0.402366, 0.952028], [0.460666, 0.952028],
    ],
    bands: {
      from90: [
        [0.050458, 0.131043], [0.06287, 0.155952], [0.071476, 0.21056], [0.080422, 0.259707],
        [0.090315, 0.323791], [0.102045, 0.446849], [0.114534, 0.545165], [0.127676, 0.612985],
        [0.142688, 0.650763], [0.159642, 0.708015], [0.17782, 0.786123], [0.195999, 0.81743],
        [0.215531, 0.839593], [0.236985, 0.87341], [0.261563, 0.900064], [0.288806, 0.928731],
        [0.322089, 0.928731], [0.357312, 0.942748], [0.410527, 0.95226], [0.463758, 0.95229],
      ],
      from140: [
        [0.049556, 0.37037], [0.06546, 0.537118], [0.07873, 0.636166], [0.092901, 0.775599],
        [0.104952, 0.801743], [0.115942, 0.846783], [0.129333, 0.846783], [0.141899, 0.846783],
        [0.15554, 0.846783], [0.168455, 0.893636], [0.183293, 0.893636], [0.199214, 0.893636],
        [0.215719, 0.893636], [0.233491, 0.893636], [0.253891, 0.924796], [0.276331, 0.924796],
        [0.304078, 0.924796], [0.333819, 0.924796], [0.380988, 0.954148], [0.449856, 0.980392],
      ],
      from165: [
        [0.046601, 0.21875], [0.059947, 0.275591], [0.070681, 0.275591], [0.080616, 0.421875],
        [0.09109, 0.4375], [0.102163, 0.468504], [0.111915, 0.468504], [0.122919, 0.476562],
        [0.134567, 0.561659], [0.146673, 0.561659], [0.160881, 0.561659], [0.17397, 0.561659],
        [0.189685, 0.561659], [0.207642, 0.561659], [0.225608, 0.561659], [0.247324, 0.609375],
        [0.277984, 0.670588], [0.313866, 0.670588], [0.36136, 0.779528], [0.439176, 0.804688],
      ],
    },
  },
});

/**
 * @param table [raw, calibrated] points, raw increasing
 * @param raw The engine's score, 0 to 1
 * @returns The table read at `raw`
 */
function read(table: readonly Point[], raw: number): number {
  const first = table[0];
  if (raw <= first[0]) {
    return first[1];
  }

  for (let i = 1; i < table.length; i += 1) {
    const [x1, y1] = table[i];
    if (raw <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (raw - x0) / (x1 - x0));
    }
  }

  return table[table.length - 1][1];
}

/**
 * @param engine The engine that scored the reading
 * @param raw Its raw score for the top tempo, 0 to 1
 * @param bpm The reading's tempo
 * @returns The chance the reading is right, 0 to 1
 */
export function calibrate(engine: EngineName, raw: number, bpm: number): number {
  const mapping = CALIBRATION[engine];
  return read(mapping.bands[bandOf(bpm)] ?? mapping.all, Math.min(1, Math.max(0, raw)));
}
