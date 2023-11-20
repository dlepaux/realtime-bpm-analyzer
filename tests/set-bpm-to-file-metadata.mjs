import NodeID3 from 'node-id3';

const file = {
    filepath: 'tests/datasets/new-order-blue-monday.mp3',
    bpm: 130,
};

(async () => {
  const success = NodeID3.write({
    bpm: file.bpm,
  }, file.filepath);

  console.log('success', success);
})();
