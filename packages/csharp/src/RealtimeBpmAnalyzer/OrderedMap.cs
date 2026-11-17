using System.Collections.Generic;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// A map that keeps its keys in first-insertion order, as a JS <c>Map</c> does, and a replaced key keeps its place.
    /// <see cref="Dictionary{TKey,TValue}"/> enumerates in insertion order only as an undocumented detail, and the
    /// peaks engine's ties depend on that order, so it is kept here explicitly.
    /// </summary>
    internal sealed class OrderedMap<TKey, TValue>
        where TKey : notnull
    {
        private readonly Dictionary<TKey, int> indexOf = new Dictionary<TKey, int>();
        private readonly List<TKey> keys = new List<TKey>();
        private readonly List<TValue> values = new List<TValue>();

        internal int Count => keys.Count;

        internal TKey KeyAt(int index) => keys[index];

        internal TValue ValueAt(int index) => values[index];

        internal bool TryGetValue(TKey key, out TValue value)
        {
            if (indexOf.TryGetValue(key, out int index))
            {
                value = values[index];
                return true;
            }

            value = default!;
            return false;
        }

        internal void Set(TKey key, TValue value)
        {
            if (indexOf.TryGetValue(key, out int index))
            {
                values[index] = value;
                return;
            }

            indexOf.Add(key, keys.Count);
            keys.Add(key);
            values.Add(value);
        }
    }
}
