package org.enso.table.data.column.operation.map.numeric;

import java.util.BitSet;
import org.enso.polyglot.common_utils.Core_Math_Utils;
import org.enso.table.data.column.builder.Builder;
import org.enso.table.data.column.operation.map.MapOperationProblemAggregator;
import org.enso.table.data.column.operation.map.TernaryMapOperation;
import org.enso.table.data.column.storage.Storage;
import org.enso.table.data.column.storage.numeric.DoubleStorage;
import org.enso.table.data.column.storage.numeric.LongStorage;
import org.enso.table.data.column.storage.type.FloatType;
import org.enso.table.data.column.storage.type.IntegerType;
import org.enso.table.error.UnexpectedTypeException;
import org.graalvm.polyglot.Context;

/** An operation rounding floating-point numbers. */
public class DoubleRoundOp extends TernaryMapOperation<Double, DoubleStorage> {

  public DoubleRoundOp(String name) {
    super(name);
  }

  @Override
  public Storage<?> runTernaryMap(
      DoubleStorage storage,
      Object decimalPlacesObject,
      Object useBankersObject,
      MapOperationProblemAggregator problemAggregator) {
    if (!(decimalPlacesObject instanceof Long decimalPlaces)) {
      throw new UnexpectedTypeException("a long.");
    }

    if (!(useBankersObject instanceof Boolean useBankers)) {
      throw new UnexpectedTypeException("a boolean.");
    }

    Context context = Context.getCurrent();

    if (decimalPlaces <= 0) {
      // Return Long storage
      long[] out = new long[storage.size()];
      BitSet isNothing = new BitSet();

      for (int i = 0; i < storage.size(); i++) {
        if (!storage.isNothing(i)) {
          double item = storage.getItemAsDouble(i);
          boolean special = Double.isNaN(item) || Double.isInfinite(item);
          if (!special) {
            out[i] = (long) Core_Math_Utils.roundDouble(item, decimalPlaces, useBankers);
          } else {
            String msg = "Value is " + item;
            problemAggregator.reportArithmeticError(msg, i);
            isNothing.set(i);
          }
        } else {
          isNothing.set(i);
        }

        context.safepoint();
      }
      return new LongStorage(out, storage.size(), isNothing, IntegerType.INT_64);
    } else {
      // Return double storage.
      var doubleBuilder =
          Builder.getForDouble(FloatType.FLOAT_64, storage.size(), problemAggregator);

      for (int i = 0; i < storage.size(); i++) {
        if (!storage.isNothing(i)) {
          double item = storage.getItemAsDouble(i);
          boolean special = Double.isNaN(item) || Double.isInfinite(item);
          if (!special) {
            doubleBuilder.appendDouble(
                Core_Math_Utils.roundDouble(item, decimalPlaces, useBankers));
          } else {
            String msg = "Value is " + item;
            problemAggregator.reportArithmeticError(msg, i);
            doubleBuilder.appendNulls(1);
          }
        } else {
          doubleBuilder.appendNulls(1);
        }

        context.safepoint();
      }
      return doubleBuilder.seal();
    }
  }
}
