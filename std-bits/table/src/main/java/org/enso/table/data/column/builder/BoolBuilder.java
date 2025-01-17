package org.enso.table.data.column.builder;

import java.util.BitSet;
import org.enso.table.data.column.storage.BoolStorage;
import org.enso.table.data.column.storage.Storage;
import org.enso.table.data.column.storage.type.BooleanType;
import org.enso.table.data.column.storage.type.StorageType;
import org.enso.table.error.ValueTypeMismatchException;
import org.enso.table.util.BitSets;

/** A builder for boolean columns. */
public class BoolBuilder implements BuilderForBoolean, BuilderWithRetyping {
  private final BitSet vals;
  private final BitSet isNothing;
  int size = 0;

  // ** Creates a new builder for boolean columns. Should be built via Builder.getForBoolean. */
  BoolBuilder(int capacity) {
    vals = new BitSet(capacity);
    isNothing = new BitSet(capacity);
  }

  @Override
  public void appendNoGrow(Object o) {
    if (o == null) {
      isNothing.set(size);
    } else {
      if (o instanceof Boolean b) {
        if (b) {
          vals.set(size);
        }
      } else {
        throw new ValueTypeMismatchException(getType(), o);
      }
    }
    size++;
  }

  @Override
  public boolean accepts(Object o) {
    return o instanceof Boolean;
  }

  @Override
  public void append(Object o) {
    appendNoGrow(o);
  }

  /**
   * Append a new boolean to this builder.
   *
   * @param value the boolean to append
   */
  public void appendBoolean(boolean value) {
    if (value) {
      vals.set(size);
    }
    size++;
  }

  @Override
  public void appendNulls(int count) {
    isNothing.set(size, size + count);
    size += count;
  }

  @Override
  public void appendBulkStorage(Storage<?> storage) {
    if (storage.getType().equals(getType())) {
      if (storage instanceof BoolStorage boolStorage) {
        BitSets.copy(boolStorage.getValues(), vals, size, boolStorage.size());
        BitSets.copy(boolStorage.getIsNothingMap(), isNothing, size, boolStorage.size());
        size += boolStorage.size();
      } else {
        throw new IllegalStateException(
            "Unexpected storage implementation for type BOOLEAN: "
                + storage
                + ". This is a bug in the Table library.");
      }
    } else {
      throw new StorageTypeMismatchException(getType(), storage.getType());
    }
  }

  @Override
  public Storage<Boolean> seal() {
    return new BoolStorage(vals, isNothing, size, false);
  }

  @Override
  public int getCurrentSize() {
    return size;
  }

  @Override
  public void copyDataTo(Object[] items) {
    for (int i = 0; i < size; i++) {
      if (isNothing.get(i)) {
        items[i] = null;
      } else {
        items[i] = vals.get(i);
      }
    }
  }

  @Override
  public boolean canRetypeTo(StorageType type) {
    return false;
  }

  @Override
  public Builder retypeTo(StorageType type) {
    throw new UnsupportedOperationException();
  }

  @Override
  public StorageType getType() {
    return BooleanType.INSTANCE;
  }
}
