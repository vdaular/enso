package org.enso.table.data.column.operation.unary;

import org.enso.table.data.column.builder.Builder;
import org.enso.table.data.column.builder.BuilderForBoolean;
import org.enso.table.data.column.operation.map.MapOperationProblemAggregator;
import org.enso.table.data.column.storage.ColumnStorage;

/** An abstract base class for unary operations returning a boolean column. */
abstract class AbstractUnaryBooleanOperation extends AbstractUnaryOperation {
  /**
   * Creates a new AbstractUnaryOperation.
   *
   * @param name the name of the operation
   * @param nothingUnchanged whether the operation should return nothing if the input is nothing
   */
  protected AbstractUnaryBooleanOperation(String name, boolean nothingUnchanged) {
    super(name, nothingUnchanged);
  }

  @Override
  protected BuilderForBoolean createBuilder(
      ColumnStorage storage, MapOperationProblemAggregator problemAggregator) {
    if (storage.getSize() > Integer.MAX_VALUE) {
      throw new IllegalArgumentException(
          "Cannot currently operate on columns larger than " + Integer.MAX_VALUE + ".");
    }
    return Builder.getForBoolean((int) storage.getSize());
  }

  @Override
  protected final void applyObjectRow(
      Object value, Builder builder, MapOperationProblemAggregator problemAggregator) {
    applyObjectRow(value, (BuilderForBoolean) builder, problemAggregator);
  }

  protected abstract void applyObjectRow(
      Object value, BuilderForBoolean builder, MapOperationProblemAggregator problemAggregator);
}
