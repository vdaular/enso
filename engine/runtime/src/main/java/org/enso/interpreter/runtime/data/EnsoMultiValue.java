package org.enso.interpreter.runtime.data;

import com.oracle.truffle.api.CompilerDirectives.CompilationFinal;
import com.oracle.truffle.api.CompilerDirectives.TruffleBoundary;
import com.oracle.truffle.api.dsl.Cached.Shared;
import com.oracle.truffle.api.dsl.GenerateUncached;
import com.oracle.truffle.api.dsl.NeverDefault;
import com.oracle.truffle.api.dsl.Specialization;
import com.oracle.truffle.api.interop.ArityException;
import com.oracle.truffle.api.interop.InteropLibrary;
import com.oracle.truffle.api.interop.InvalidArrayIndexException;
import com.oracle.truffle.api.interop.UnknownIdentifierException;
import com.oracle.truffle.api.interop.UnsupportedMessageException;
import com.oracle.truffle.api.interop.UnsupportedTypeException;
import com.oracle.truffle.api.library.CachedLibrary;
import com.oracle.truffle.api.library.ExportLibrary;
import com.oracle.truffle.api.library.ExportMessage;
import com.oracle.truffle.api.nodes.Node;
import java.math.BigInteger;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.enso.interpreter.node.callable.resolver.MethodResolverNode;
import org.enso.interpreter.runtime.EnsoContext;
import org.enso.interpreter.runtime.callable.UnresolvedSymbol;
import org.enso.interpreter.runtime.callable.function.Function;
import org.enso.interpreter.runtime.data.vector.ArrayLikeHelpers;
import org.enso.interpreter.runtime.library.dispatch.TypesLibrary;
import org.graalvm.collections.Pair;

@ExportLibrary(TypesLibrary.class)
@ExportLibrary(InteropLibrary.class)
public final class EnsoMultiValue extends EnsoObject {

  @CompilationFinal(dimensions = 1)
  private final Type[] types;

  @CompilationFinal private final int methodDispatchTypes;

  @CompilationFinal(dimensions = 1)
  private final Object[] values;

  private EnsoMultiValue(Type[] types, int dispatchTypes, Object[] values) {
    this.types = types;
    this.methodDispatchTypes = dispatchTypes;
    assert types.length == values.length;
    this.values = values;
    assert !Stream.of(values).anyMatch(v -> v instanceof EnsoMultiValue)
        : "Avoid double wrapping " + Arrays.toString(values);
  }

  /**
   * Creates new instance of EnsoMultiValue from provided information.
   *
   * @param types all the types this value can be {@link CastToNode cast to}
   * @param dispatchTypes the (subset of) types that the value is cast to currently - bigger than
   *     {@code 0} and at most {@code type.length}
   * @param values value of each of the provided {@code types}
   * @return non-{@code null} multi value instance
   */
  @NeverDefault
  public static EnsoMultiValue create(
      @NeverDefault Type[] types, @NeverDefault int dispatchTypes, @NeverDefault Object... values) {
    assert dispatchTypes > 0;
    assert dispatchTypes <= types.length;
    assert types.length == values.length;
    return new EnsoMultiValue(types, dispatchTypes, values);
  }

  @ExportMessage
  boolean hasType() {
    return true;
  }

  @ExportMessage
  boolean hasSpecialDispatch() {
    return true;
  }

  @ExportMessage
  final Type getType() {
    return types[0];
  }

  @ExportMessage
  final Type[] allTypes(boolean includeExtraTypes) {
    if (includeExtraTypes || methodDispatchTypes == types.length) {
      return types.clone();
    } else {
      return Arrays.copyOf(types, methodDispatchTypes);
    }
  }

  @ExportMessage
  @TruffleBoundary
  @Override
  public final String toDisplayString(boolean ignore) {
    return toString();
  }

  private enum InteropType {
    NULL,
    BOOLEAN,
    DATE_TIME_ZONE,
    DURATION,
    STRING,
    NUMBER,
    POINTER,
    META_OBJECT,
    ITERATOR;

    private record Value(InteropType type, Object value) {}

    static Value find(Object[] values, int max, InteropLibrary iop) {
      for (var i = 0; i < max; i++) {
        var v = values[i];
        if (iop.isNull(v)) {
          return new Value(NULL, v);
        }
        if (iop.isBoolean(v)) {
          return new Value(BOOLEAN, v);
        }
        if (iop.isDate(v) || iop.isTime(v) || iop.isTimeZone(v)) {
          return new Value(DATE_TIME_ZONE, v);
        }
        if (iop.isDuration(v)) {
          return new Value(DURATION, v);
        }
        if (iop.isString(v)) {
          return new Value(STRING, v);
        }
        if (iop.isNumber(v)) {
          return new Value(NUMBER, v);
        }
        if (iop.isPointer(v)) {
          return new Value(POINTER, v);
        }
        if (iop.isMetaObject(v)) {
          return new Value(META_OBJECT, v);
        }
        if (iop.isIterator(v)) {
          return new Value(ITERATOR, v);
        }
      }
      return new Value(null, null);
    }
  }

  @ExportMessage
  boolean isBoolean(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.BOOLEAN;
  }

  @ExportMessage
  boolean asBoolean(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.BOOLEAN) {
      return iop.asBoolean(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean isString(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.STRING;
  }

  @ExportMessage
  String asString(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.STRING) {
      return iop.asString(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean isNumber(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER;
  }

  @ExportMessage
  boolean fitsInByte(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInByte(both.value());
  }

  @ExportMessage
  boolean fitsInShort(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInShort(both.value());
  }

  @ExportMessage
  boolean fitsInInt(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInInt(both.value());
  }

  @ExportMessage
  boolean fitsInLong(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInLong(both.value());
  }

  @ExportMessage
  boolean fitsInFloat(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInFloat(both.value());
  }

  @ExportMessage
  boolean fitsInDouble(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInDouble(both.value());
  }

  @ExportMessage
  byte asByte(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asByte(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  short asShort(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asShort(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  int asInt(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asInt(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  long asLong(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asLong(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  float asFloat(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asFloat(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  double asDouble(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asDouble(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean fitsInBigInteger(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.NUMBER && iop.fitsInBigInteger(both.value());
  }

  @ExportMessage
  BigInteger asBigInteger(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.NUMBER) {
      return iop.asBigInteger(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean isTime(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.DATE_TIME_ZONE && iop.isTime(both.value());
  }

  @ExportMessage
  LocalTime asTime(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.DATE_TIME_ZONE) {
      return iop.asTime(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean isDate(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.DATE_TIME_ZONE && iop.isDate(both.value());
  }

  @ExportMessage
  LocalDate asDate(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.DATE_TIME_ZONE) {
      return iop.asDate(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean isTimeZone(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.DATE_TIME_ZONE && iop.isTimeZone(both.value());
  }

  @ExportMessage
  ZoneId asTimeZone(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.DATE_TIME_ZONE) {
      return iop.asTimeZone(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean isDuration(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    return both.type() == InteropType.DURATION;
  }

  @ExportMessage
  Duration asDuration(@Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException {
    var both = InteropType.find(values, methodDispatchTypes, iop);
    if (both.type() == InteropType.DURATION) {
      return iop.asDuration(both.value());
    }
    throw UnsupportedMessageException.create();
  }

  @ExportMessage
  boolean hasMembers() {
    return true;
  }

  @ExportMessage
  @TruffleBoundary
  Object getMembers(
      boolean includeInternal, @Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    var names = new TreeSet<String>();
    for (var i = 0; i < methodDispatchTypes; i++) {
      try {
        var members = iop.getMembers(values[i]);
        var len = iop.getArraySize(members);
        for (var j = 0L; j < len; j++) {
          var name = iop.readArrayElement(members, j);
          names.add(iop.asString(name));
        }
      } catch (InvalidArrayIndexException | UnsupportedMessageException ex) {
      }
    }
    return ArrayLikeHelpers.wrapObjectsWithCheckAt(names.toArray());
  }

  @ExportMessage
  boolean isMemberInvocable(
      String name, @Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop) {
    for (var i = 0; i < methodDispatchTypes; i++) {
      if (iop.isMemberInvocable(values[i], name)) {
        return true;
      }
    }
    return false;
  }

  @ExportMessage
  Object invokeMember(
      String name,
      Object[] args,
      @Shared("interop") @CachedLibrary(limit = "10") InteropLibrary iop)
      throws UnsupportedMessageException,
          ArityException,
          UnsupportedTypeException,
          UnknownIdentifierException {
    for (var i = 0; i < methodDispatchTypes; i++) {
      if (iop.isMemberInvocable(values[i], name)) {
        return iop.invokeMember(values[i], name, args);
      }
    }
    throw UnknownIdentifierException.create(name);
  }

  @TruffleBoundary
  @Override
  public String toString() {
    return Arrays.stream(types).map(t -> t.getName()).collect(Collectors.joining(" & "));
  }

  /** Casts {@link EnsoMultiValue} to requested type effectively. */
  @GenerateUncached
  public abstract static class CastToNode extends Node {
    /**
     * Casts value in a multi value into specific type.
     *
     * @param type the requested type
     * @param mv a multi value
     * @param reorderOnly allow (modified) {@link EnsoMultiValue} to be returned otherwise extract
     *     the value of {@code type} and return it directly
     * @param allTypes should we search all types or just up to {@code methodDispatchTypes}
     * @return instance of the {@code type} or {@code null} if no suitable value was found
     */
    public final Object findTypeOrNull(
        Type type, EnsoMultiValue mv, boolean reorderOnly, boolean allTypes) {
      return executeCast(type, mv, reorderOnly, allTypes);
    }

    abstract Object executeCast(
        Type type, EnsoMultiValue mv, boolean reorderOnly, boolean allTypes);

    @NeverDefault
    public static CastToNode create() {
      return EnsoMultiValueFactory.CastToNodeGen.create();
    }

    @NeverDefault
    public static CastToNode getUncached() {
      return EnsoMultiValueFactory.CastToNodeGen.getUncached();
    }

    @Specialization
    Object castsToAType(Type type, EnsoMultiValue mv, boolean reorderOnly, boolean allTypes) {
      var ctx = EnsoContext.get(this);
      var max = allTypes ? mv.types.length : mv.methodDispatchTypes;
      for (var i = 0; i < max; i++) {
        for (var t : mv.types[i].allTypes(ctx)) {
          if (t == type) {
            if (reorderOnly) {
              var copyTypes = mv.types.clone();
              var copyValues = mv.values.clone();
              copyTypes[i] = mv.types[0];
              copyValues[i] = mv.values[0];
              copyTypes[0] = mv.types[i];
              copyValues[0] = mv.values[i];
              return EnsoMultiValue.create(copyTypes, 1, copyValues);
            } else {
              return mv.values[i];
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Tries to resolve the symbol in one of multi value types.
   *
   * @param node resolution node to use
   * @param symbol symbol to resolve
   * @return {@code null} when no resolution was found or pair of function and type solved
   */
  public final Pair<Function, Type> resolveSymbol(
      MethodResolverNode node, UnresolvedSymbol symbol) {
    var ctx = EnsoContext.get(node);
    Pair<Function, Type> foundAnyMethod = null;
    for (var i = 0; i < methodDispatchTypes; i++) {
      var t = types[i];
      var fnAndType = node.execute(t, symbol);
      if (fnAndType != null) {
        if (methodDispatchTypes == 1 || fnAndType.getRight() != ctx.getBuiltins().any()) {
          return Pair.create(fnAndType.getLeft(), t);
        }
        foundAnyMethod = fnAndType;
      }
    }
    return foundAnyMethod;
  }
}
