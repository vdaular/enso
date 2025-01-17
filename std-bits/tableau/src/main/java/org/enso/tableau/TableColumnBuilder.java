package org.enso.tableau;

import com.tableau.hyperapi.Result;
import java.sql.Types;
import java.time.Duration;
import java.time.Period;
import java.time.ZoneId;
import java.util.function.Consumer;
import org.enso.table.data.column.builder.Builder;
import org.enso.table.data.column.storage.Storage;
import org.enso.table.data.column.storage.type.BigDecimalType;
import org.enso.table.data.column.storage.type.BigIntegerType;
import org.enso.table.data.column.storage.type.DateTimeType;
import org.enso.table.data.column.storage.type.DateType;
import org.enso.table.data.column.storage.type.FloatType;
import org.enso.table.data.column.storage.type.IntegerType;
import org.enso.table.data.column.storage.type.TextType;
import org.enso.table.data.column.storage.type.TimeOfDayType;
import org.enso.table.problems.ProblemAggregator;

/** A builder for a single column of a table. */
record TableColumnBuilder(Builder builder, Consumer<Result> appendMethod) {
  private static Consumer<Result> nullAppender(Builder builder, int index, Consumer<Result> inner) {
    return r -> {
      if (r.isNull(index)) {
        builder.appendNulls(1);
      } else {
        inner.accept(r);
      }
    };
  }

  /**
   * Convert a Tableau Interval into either a Duration or a Period (with fallback to String if
   * needed).
   */
  private static Object readInterval(Result r, int index) {
    var interval = r.getInterval(index);
    if (interval.getMonths() == 0 && interval.getYears() == 0) {
      // Treat as a Duration
      long seconds =
          ((interval.getDays() * 24L + interval.getHours()) * 60 + interval.getMinutes()) * 60
              + interval.getSeconds();
      return Duration.ofNanos(seconds * 1_000_000_000L + interval.getMicroseconds() * 1_000L);
    } else if (interval.getHours() == 0
        && interval.getMinutes() == 0
        && interval.getSeconds() == 0
        && interval.getMicroseconds() == 0) {
      // Treat as a Period
      return Period.of(interval.getYears(), interval.getMonths(), interval.getDays());
    } else {
      // Can't do better than toString
      return interval.toString();
    }
  }

  public static TableColumnBuilder create(
      HyperTableColumn column, int initialRowCount, ProblemAggregator problemAggregator) {
    switch (column.typeID()) {
      case Types.BOOLEAN:
        var boolBuilder = Builder.getForBoolean(initialRowCount);
        return new TableColumnBuilder(
            boolBuilder,
            nullAppender(
                boolBuilder,
                column.index(),
                r -> boolBuilder.appendBoolean(r.getBool(column.index()))));
      case Types.BIGINT:
        var longBuilder =
            Builder.getForLong(IntegerType.INT_64, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            longBuilder,
            nullAppender(
                longBuilder,
                column.index(),
                r -> longBuilder.appendLong(r.getLong(column.index()))));
      case Types.INTEGER:
        var intBuilder = Builder.getForLong(IntegerType.INT_32, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            intBuilder,
            nullAppender(
                intBuilder, column.index(), r -> intBuilder.appendLong(r.getInt(column.index()))));
      case Types.SMALLINT:
        var shortBuilder =
            Builder.getForLong(IntegerType.INT_16, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            shortBuilder,
            nullAppender(
                shortBuilder,
                column.index(),
                r -> shortBuilder.appendLong(r.getShort(column.index()))));
      case Types.NUMERIC:
        if (column.scale().isEmpty()) {
          throw new IllegalArgumentException("NUMERIC column must have a scale.");
        }
        if (column.scale().getAsInt() == 0) {
          var bigIntBuilder =
              Builder.getForType(BigIntegerType.INSTANCE, initialRowCount, problemAggregator);
          return new TableColumnBuilder(
              bigIntBuilder,
              nullAppender(
                  bigIntBuilder,
                  column.index(),
                  r -> bigIntBuilder.append(r.getBigDecimal(column.index()).toBigInteger())));
        } else {
          var bigDecimalBuilder =
              Builder.getForType(BigDecimalType.INSTANCE, initialRowCount, problemAggregator);
          return new TableColumnBuilder(
              bigDecimalBuilder,
              nullAppender(
                  bigDecimalBuilder,
                  column.index(),
                  r -> bigDecimalBuilder.append(r.getBigDecimal(column.index()))));
        }
      case Types.FLOAT:
        var floatBuilder =
            Builder.getForDouble(FloatType.FLOAT_64, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            floatBuilder,
            nullAppender(
                floatBuilder,
                column.index(),
                r -> floatBuilder.appendDouble(r.getFloat(column.index()))));
      case Types.DOUBLE:
        var doubleBuilder =
            Builder.getForDouble(FloatType.FLOAT_64, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            doubleBuilder,
            nullAppender(
                doubleBuilder,
                column.index(),
                r -> doubleBuilder.appendDouble(r.getDouble(column.index()))));
      case Types.VARCHAR, Types.CHAR:
        var textType =
            column.length().isEmpty()
                ? new TextType(-1, false)
                : new TextType(column.length().getAsInt(), column.typeID() == Types.CHAR);
        var textBuilder = Builder.getForType(textType, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            textBuilder,
            nullAppender(
                textBuilder, column.index(), r -> textBuilder.append(r.getString(column.index()))));
      case Types.DATE:
        var dateBuilder = Builder.getForType(DateType.INSTANCE, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            dateBuilder,
            nullAppender(
                dateBuilder,
                column.index(),
                r -> dateBuilder.append(r.getLocalDate(column.index()))));
      case Types.TIME:
        var timeBuilder =
            Builder.getForType(TimeOfDayType.INSTANCE, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            timeBuilder,
            nullAppender(
                timeBuilder,
                column.index(),
                r -> timeBuilder.append(r.getLocalTime(column.index()))));
      case Types.TIMESTAMP:
        var dateTimeBuilder =
            Builder.getForType(DateTimeType.INSTANCE, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            dateTimeBuilder,
            nullAppender(
                dateTimeBuilder,
                column.index(),
                r ->
                    dateTimeBuilder.append(
                        r.getLocalDateTime(column.index()).atZone(ZoneId.systemDefault()))));
      case Types.TIMESTAMP_WITH_TIMEZONE:
        var dateTimeTzBuilder =
            Builder.getForType(DateTimeType.INSTANCE, initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            dateTimeTzBuilder,
            nullAppender(
                dateTimeTzBuilder,
                column.index(),
                r -> dateTimeTzBuilder.append(r.getZonedDateTime(column.index()))));
      case HyperTableColumn.JSON:
        var jsonBuilder = Builder.getObjectBuilder(initialRowCount);
        return new TableColumnBuilder(
            jsonBuilder,
            nullAppender(
                jsonBuilder, column.index(), r -> jsonBuilder.append(r.getString(column.index()))));
      case HyperTableColumn.INTERVAL:
        var intervalBuilder = Builder.getInferredBuilder(initialRowCount, problemAggregator);
        return new TableColumnBuilder(
            intervalBuilder,
            nullAppender(
                intervalBuilder,
                column.index(),
                r -> intervalBuilder.append(readInterval(r, column.index()))));
      case Types.OTHER:
        var mixedBuilder = Builder.getObjectBuilder(initialRowCount);
        return new TableColumnBuilder(
            mixedBuilder,
            nullAppender(
                mixedBuilder,
                column.index(),
                r -> mixedBuilder.append(r.getObject(column.index()))));
    }

    throw new IllegalArgumentException("Unsupported column type: " + column.typeID());
  }

  public void append(Result result) {
    appendMethod.accept(result);
  }

  public Storage<?> seal() {
    return builder.seal();
  }
}
