package org.enso.table.data.column.operation.cast;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.BitSet;
import org.enso.base.polyglot.NumericConverter;
import org.enso.table.data.column.builder.LongBuilder;
import org.enso.table.data.column.builder.NumericBuilder;
import org.enso.table.data.column.storage.BoolStorage;
import org.enso.table.data.column.storage.Storage;
import org.enso.table.data.column.storage.numeric.AbstractLongStorage;
import org.enso.table.data.column.storage.numeric.BigDecimalStorage;
import org.enso.table.data.column.storage.numeric.BigIntegerStorage;
import org.enso.table.data.column.storage.numeric.DoubleStorage;
import org.enso.table.data.column.storage.numeric.LongStorage;
import org.enso.table.data.column.storage.type.AnyObjectType;
import org.enso.table.data.column.storage.type.IntegerType;
import org.enso.table.util.BitSets;
import org.graalvm.polyglot.Context;

public class ToIntegerStorageConverter implements StorageConverter<Long> {
  private final IntegerType targetType;

  public ToIntegerStorageConverter(IntegerType targetType) {
    this.targetType = targetType;
  }

  @Override
  public Storage<Long> cast(Storage<?> storage, CastProblemAggregator problemAggregator) {
    if (storage instanceof AbstractLongStorage longStorage) {
      if (longStorage.getType().equals(targetType)) {
        return longStorage;
      } else {
        return convertLongStorage(longStorage, problemAggregator);
      }
    } else if (storage instanceof DoubleStorage doubleStorage) {
      return convertDoubleStorage(doubleStorage, problemAggregator);
    } else if (storage instanceof BoolStorage boolStorage) {
      return convertBoolStorage(boolStorage, problemAggregator);
    } else if (storage instanceof BigIntegerStorage bigIntegerStorage) {
      return convertBigIntegerStorage(bigIntegerStorage, problemAggregator);
    } else if (storage instanceof BigDecimalStorage bigDecimalStorage) {
      return convertBigDecimalStorage(bigDecimalStorage, problemAggregator);
    } else if (storage.getType() instanceof AnyObjectType) {
      return castFromMixed(storage, problemAggregator);
    } else {
      throw new IllegalStateException(
          "No known strategy for casting storage " + storage + " to Integer.");
    }
  }

  public Storage<Long> castFromMixed(
      Storage<?> mixedStorage, CastProblemAggregator problemAggregator) {
    Context context = Context.getCurrent();
    LongBuilder builder =
        NumericBuilder.createLongBuilder(mixedStorage.size(), targetType, problemAggregator);
    for (int i = 0; i < mixedStorage.size(); i++) {
      Object o = mixedStorage.getItemBoxed(i);
      if (o == null) {
        builder.appendNulls(1);
      } else if (o instanceof Boolean b) {
        builder.appendLong(booleanAsLong(b));
      } else if (NumericConverter.isCoercibleToLong(o)) {
        long x = NumericConverter.coerceToLong(o);
        if (targetType.fits(x)) {
          builder.appendLongUnchecked(x);
        } else {
          problemAggregator.reportNumberOutOfRange(x);
          builder.appendNulls(1);
        }
      } else if (NumericConverter.isFloatLike(o)) {
        double x = NumericConverter.coerceToDouble(o);
        if (targetType.fits(x)) {
          long converted = (long) x;
          builder.appendLongUnchecked(converted);
        } else {
          problemAggregator.reportNumberOutOfRange(x);
          builder.appendNulls(1);
        }
      } else if (o instanceof BigInteger bigInteger) {
        if (targetType.fits(bigInteger)) {
          builder.appendLongUnchecked(bigInteger.longValue());
        } else {
          problemAggregator.reportNumberOutOfRange(bigInteger);
          builder.appendNulls(1);
        }
      } else if (o instanceof BigDecimal bigDecimal) {
        BigInteger bigInteger = bigDecimal.toBigInteger();
        if (targetType.fits(bigInteger)) {
          builder.appendLongUnchecked(bigInteger.longValue());
        } else {
          problemAggregator.reportNumberOutOfRange(bigDecimal);
          builder.appendNulls(1);
        }
      } else {
        problemAggregator.reportConversionFailure(o);
        builder.appendNulls(1);
      }

      context.safepoint();
    }

    return builder.seal();
  }

  private Storage<Long> convertBoolStorage(
      BoolStorage boolStorage, CastProblemAggregator problemAggregator) {
    Context context = Context.getCurrent();
    int n = boolStorage.size();
    LongBuilder builder = NumericBuilder.createLongBuilder(n, targetType, problemAggregator);
    for (int i = 0; i < n; i++) {
      if (boolStorage.isNothing(i)) {
        builder.appendNulls(1);
      } else {
        boolean value = boolStorage.getItem(i);
        builder.appendLong(booleanAsLong(value));
      }

      context.safepoint();
    }

    return builder.seal();
  }

  private Storage<Long> convertDoubleStorage(
      DoubleStorage doubleStorage, CastProblemAggregator problemAggregator) {
    Context context = Context.getCurrent();
    int n = doubleStorage.size();
    LongBuilder builder = NumericBuilder.createLongBuilder(n, targetType, problemAggregator);
    for (int i = 0; i < n; i++) {
      if (doubleStorage.isNothing(i)) {
        builder.appendNulls(1);
      } else {
        double value = doubleStorage.getItemAsDouble(i);
        if (targetType.fits(value)) {
          long converted = (long) value;
          builder.appendLong(converted);
        } else {
          builder.appendNulls(1);
          problemAggregator.reportConversionFailure(value);
        }
      }

      context.safepoint();
    }

    return builder.seal();
  }

  private Storage<Long> convertLongStorage(
      AbstractLongStorage longStorage, CastProblemAggregator problemAggregator) {
    boolean isWidening = targetType.fits(longStorage.getType());
    if (isWidening) {
      // If the target type is larger than the source type, we can just widen the storage without
      // doing any checks.
      return longStorage.widen(targetType);
    } else {
      // Otherwise we have to check for elements that may not fit.
      Context context = Context.getCurrent();
      int n = longStorage.size();
      long[] data = new long[n];
      BitSet isNothing = BitSets.makeDuplicate(longStorage.getIsNothingMap());
      for (int i = 0; i < n; i++) {
        if (!isNothing.get(i)) {
          long value = longStorage.getItem(i);
          if (targetType.fits(value)) {
            data[i] = value;
          } else {
            isNothing.set(i);
            problemAggregator.reportNumberOutOfRange(value);
          }
        }

        context.safepoint();
      }

      return new LongStorage(data, n, isNothing, targetType);
    }
  }

  private Storage<Long> convertBigIntegerStorage(
      Storage<BigInteger> storage, CastProblemAggregator problemAggregator) {
    Context context = Context.getCurrent();
    int n = storage.size();
    long[] data = new long[n];
    BitSet isNothing = new BitSet();
    for (int i = 0; i < n; i++) {
      BigInteger value = storage.getItemBoxed(i);
      if (value == null) {
        isNothing.set(i);
      } else if (targetType.fits(value)) {
        data[i] = value.longValue();
      } else {
        isNothing.set(i);
        problemAggregator.reportNumberOutOfRange(value);
      }

      context.safepoint();
    }

    return new LongStorage(data, n, isNothing, targetType);
  }

  private Storage<Long> convertBigDecimalStorage(
      Storage<BigDecimal> storage, CastProblemAggregator problemAggregator) {
    Context context = Context.getCurrent();
    int n = storage.size();
    long[] data = new long[n];
    BitSet isNothing = new BitSet();
    for (int i = 0; i < n; i++) {
      BigDecimal value = storage.getItemBoxed(i);
      if (value == null) {
        isNothing.set(i);
      } else {
        BigInteger bigInteger = value.toBigInteger();
        if (targetType.fits(bigInteger)) {
          data[i] = bigInteger.longValue();
        } else {
          isNothing.set(i);
          problemAggregator.reportNumberOutOfRange(value);
        }
      }

      context.safepoint();
    }

    return new LongStorage(data, n, isNothing, targetType);
  }

  public static long booleanAsLong(boolean value) {
    return value ? 1L : 0L;
  }
}
