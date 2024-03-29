import type {AudioFile} from '../types';

/**
 * Mean Absolute Error (MAE) considering all tempo candidates
 * @returns
 */
function calculateMae(audioFiles: AudioFile[]): number {
  let totalError = 0;

  for (const file of audioFiles) {
    const errors = file.tempos.map(candidate => Math.abs(file.bpm - candidate.tempo));
    totalError += Math.min(...errors); // Consider the minimum error among candidates
  }

  return totalError / audioFiles.length;
}

/**
 * Root Mean Squared Error (RMSE) considering all tempo candidates
 * @returns
 */
function calculateRmse(audioFiles: AudioFile[]): number {
  let totalSquaredError = 0;

  for (const file of audioFiles) {
    const squaredErrors = file.tempos.map(candidate => (file.bpm - candidate.tempo) ** 2);
    const minSquaredError = Math.min(...squaredErrors); // Consider the minimum squared error
    totalSquaredError += minSquaredError;
  }

  const meanSquaredError = totalSquaredError / audioFiles.length;

  return Math.sqrt(meanSquaredError);
}

/**
 * Percentage of Accurate Estimates (within a tolerance) considering all tempo candidates
 * @param tolerance
 * @returns
 */
function calculateAccuracy(audioFiles: AudioFile[], tolerance: number): number {
  let accurateCount = 0;

  for (const file of audioFiles) {
    const accurates = file.tempos.filter(candidate => Math.abs(file.bpm - candidate.tempo) <= tolerance);
    if (accurates.length > 0) {
      accurateCount++;
    }
  }

  return (accurateCount / audioFiles.length) * 100;
}

export function log(audioFiles: AudioFile[]) {
  const stats = {
    mae: calculateMae(audioFiles),
    rmse: calculateRmse(audioFiles),
    accuracy: calculateAccuracy(audioFiles, 1),
  };

  console.log('MAE:', stats.mae);
  console.log('RMSE:', stats.rmse);
  console.log('Accuracy:', stats.accuracy);

  return stats;
}
