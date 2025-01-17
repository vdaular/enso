package org.enso.interpreter.runtime.data.atom;

import com.oracle.truffle.api.CompilerDirectives;
import com.oracle.truffle.api.CompilerDirectives.TruffleBoundary;
import com.oracle.truffle.api.RootCallTarget;
import com.oracle.truffle.api.dsl.Bind;
import com.oracle.truffle.api.interop.ArityException;
import com.oracle.truffle.api.interop.InteropLibrary;
import com.oracle.truffle.api.library.ExportLibrary;
import com.oracle.truffle.api.library.ExportMessage;
import com.oracle.truffle.api.nodes.Node;
import com.oracle.truffle.api.nodes.RootNode;
import com.oracle.truffle.api.source.SourceSection;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.enso.compiler.context.LocalScope;
import org.enso.interpreter.EnsoLanguage;
import org.enso.interpreter.node.ExpressionNode;
import org.enso.interpreter.node.MethodRootNode;
import org.enso.interpreter.node.callable.argument.ReadArgumentNode;
import org.enso.interpreter.node.callable.function.BlockNode;
import org.enso.interpreter.runtime.EnsoContext;
import org.enso.interpreter.runtime.Module;
import org.enso.interpreter.runtime.callable.Annotation;
import org.enso.interpreter.runtime.callable.argument.ArgumentDefinition;
import org.enso.interpreter.runtime.callable.function.Function;
import org.enso.interpreter.runtime.callable.function.FunctionSchema;
import org.enso.interpreter.runtime.data.EnsoObject;
import org.enso.interpreter.runtime.data.Type;
import org.enso.interpreter.runtime.library.dispatch.TypesLibrary;
import org.enso.interpreter.runtime.scope.ModuleScope;
import org.enso.interpreter.runtime.util.CachingSupplier;
import org.enso.pkg.QualifiedName;

/**
 * A representation of an {@link Atom} constructor. Use {@link AtomNewInstanceNode} to instantiate
 * instances of this constructor.
 */
@ExportLibrary(InteropLibrary.class)
@ExportLibrary(TypesLibrary.class)
public final class AtomConstructor extends EnsoObject {

  private final String name;
  private final Module definitionModule;
  private final boolean builtin;
  private @CompilerDirectives.CompilationFinal Atom cachedInstance;
  private @CompilerDirectives.CompilationFinal(dimensions = 1) String[] fieldNames;
  private @CompilerDirectives.CompilationFinal Supplier<Function> constructorFunctionSupplier;
  private @CompilerDirectives.CompilationFinal Function constructorFunction;
  private @CompilerDirectives.CompilationFinal Function accessor;

  private final Lock layoutsLock = new ReentrantLock();
  private @CompilerDirectives.CompilationFinal Supplier<Layout> boxedLayoutSupplier;
  private @CompilerDirectives.CompilationFinal Layout boxedLayout;
  private Layout[] unboxingLayouts = new Layout[0];

  private final Type type;

  /**
   * Creates a new Atom constructor for a given name.The constructor is not valid until {@link
   * AtomConstructor#initializeFields} is called.
   *
   * @param name the name of the Atom constructor
   * @param definitionModule the module in which this constructor was defined
   * @param type associated type
   */
  public AtomConstructor(String name, Module definitionModule, Type type) {
    this(name, definitionModule, type, false);
  }

  /**
   * Creates a new Atom constructor for a given name. The constructor is not valid until {@link
   * AtomConstructor#initializeFields} is called.
   *
   * @param name the name of the Atom constructor
   * @param definitionModule the module in which this constructor was defined
   * @param type associated type
   * @param builtin if true, the constructor refers to a builtin type (annotated with @BuiltinType
   */
  public AtomConstructor(String name, Module definitionModule, Type type, boolean builtin) {
    this.name = name;
    this.definitionModule = definitionModule;
    this.type = type;
    this.builtin = builtin;
  }

  /**
   * Is the constructor initialized or not.
   *
   * @return {@code true} if {@link #initializeFields} method has already been called
   */
  public boolean isInitialized() {
    return accessor != null;
  }

  boolean isBuiltin() {
    return builtin;
  }

  /**
   * Create new builder required for initialization of the atom constructor.
   *
   * @param section the source section
   * @param localScope the description of the local scope
   * @param assignments the expressions that evaluate and assign constructor arguments to local vars
   * @param varReads the expressions that read field values from local vars
   * @param annotations the list of attached annotations
   * @param args the list of argument definitions
   */
  public static InitializationBuilder newInitializationBuilder(
      SourceSection section,
      LocalScope localScope,
      ExpressionNode[] assignments,
      ExpressionNode[] varReads,
      Annotation[] annotations,
      ArgumentDefinition[] args) {
    return new InitializationBuilder(section, localScope, assignments, varReads, annotations, args);
  }

  /** Builder required for initialization of the atom constructor. */
  public static final class InitializationBuilder {

    private final SourceSection section;
    private final LocalScope localScope;
    private final ExpressionNode[] assignments;
    private final ExpressionNode[] varReads;
    private final Annotation[] annotations;
    private final ArgumentDefinition[] args;

    /**
     * Create new builder required for initialization of the atom constructor.
     *
     * @param section the source section
     * @param localScope the description of the local scope
     * @param assignments the expressions that evaluate and assign constructor arguments to local
     *     vars
     * @param varReads the expressions that read field values from local vars
     * @param annotations the list of attached annotations
     * @param args the list of argument definitions
     */
    InitializationBuilder(
        SourceSection section,
        LocalScope localScope,
        ExpressionNode[] assignments,
        ExpressionNode[] varReads,
        Annotation[] annotations,
        ArgumentDefinition[] args) {
      this.section = section;
      this.localScope = localScope;
      this.assignments = assignments;
      this.varReads = varReads;
      this.annotations = annotations;
      this.args = args;
    }

    private SourceSection getSection() {
      return section;
    }

    private LocalScope getLocalScope() {
      return localScope;
    }

    private ExpressionNode[] getAssignments() {
      return assignments;
    }

    private ExpressionNode[] getVarReads() {
      return varReads;
    }

    private Annotation[] getAnnotations() {
      return annotations;
    }

    private ArgumentDefinition[] getArgs() {
      return args;
    }
  }

  /**
   * The result of this atom constructor initialization.
   *
   * @param constructorFunction the atom constructor function
   * @param layout the atom layout
   */
  private record InitializationResult(Function constructorFunction, Layout layout) {}

  /**
   * Generates a constructor function for this {@link AtomConstructor}. Note that such manually
   * constructed argument definitions must not have default arguments.
   *
   * @return {@code this}, for convenience
   */
  public AtomConstructor initializeFields(
      EnsoLanguage language, ModuleScope.Builder scopeBuilder, ArgumentDefinition... args) {
    ExpressionNode[] reads = new ExpressionNode[args.length];
    String[] fieldNames = new String[args.length];
    for (int i = 0; i < args.length; i++) {
      reads[i] = ReadArgumentNode.build(i, null);
      fieldNames[i] = args[i].getName();
    }

    var builder =
        newInitializationBuilder(
            null, LocalScope.empty(), new ExpressionNode[0], reads, new Annotation[0], args);
    return initializeFields(language, scopeBuilder, CachingSupplier.forValue(builder), fieldNames);
  }

  /**
   * Sets the fields of this {@link AtomConstructor} and generates a constructor function.
   *
   * @param language the language implementation
   * @param scopeBuilder the module scope's builder where the accessor should be registered at
   * @param initializationBuilderSupplier the function supplying the parts required for
   *     initialization
   * @param fieldNames the argument names
   * @return {@code this}, for convenience
   */
  public AtomConstructor initializeFields(
      EnsoLanguage language,
      ModuleScope.Builder scopeBuilder,
      Supplier<InitializationBuilder> initializationBuilderSupplier,
      String[] fieldNames) {
    CompilerDirectives.transferToInterpreterAndInvalidate();
    assert accessor == null : "Don't initialize twice: " + this.name;
    this.fieldNames = fieldNames;
    if (fieldNames.length == 0) {
      cachedInstance = BoxingAtom.singleton(this);
    } else {
      cachedInstance = null;
    }
    CachingSupplier<InitializationResult> initializationResultSupplier =
        CachingSupplier.wrap(
            () -> {
              var builder = initializationBuilderSupplier.get();
              var constructorFunction =
                  buildConstructorFunction(
                      language,
                      builder.getSection(),
                      builder.getLocalScope(),
                      scopeBuilder,
                      builder.getAssignments(),
                      builder.getVarReads(),
                      builder.getAnnotations(),
                      builder.getArgs());
              var layout = Layout.createBoxed(builder.getArgs());
              return new InitializationResult(constructorFunction, layout);
            });
    this.boxedLayoutSupplier =
        initializationResultSupplier.map(initializationResult -> initializationResult.layout);
    this.constructorFunctionSupplier =
        initializationResultSupplier.map(
            initializationResult -> initializationResult.constructorFunction);
    this.accessor = generateQualifiedAccessor(language, scopeBuilder);
    return this;
  }

  /**
   * Generates a constructor function to be used for object instantiation from other Enso code.
   * Building constructor function involves storing the argument in a local var and then reading it
   * again on purpose. That way default arguments can refer to previously defined constructor
   * arguments.
   *
   * @param localScope a description of the local scope
   * @param assignments the expressions that evaluate and assign constructor arguments to local vars
   * @param varReads the expressions that read field values from previously evaluated local vars
   * @param args the argument definitions for the constructor function to take
   * @return a {@link Function} taking the specified arguments and returning an instance for this
   *     {@link AtomConstructor}
   */
  private Function buildConstructorFunction(
      EnsoLanguage language,
      SourceSection section,
      LocalScope localScope,
      ModuleScope.Builder scopeBuilder,
      ExpressionNode[] assignments,
      ExpressionNode[] varReads,
      Annotation[] annotations,
      ArgumentDefinition[] args) {
    ExpressionNode instantiateNode = InstantiateNode.build(this, varReads);
    if (section != null) {
      instantiateNode.setSourceLocation(section.getCharIndex(), section.getCharLength());
    }
    BlockNode instantiateBlock = BlockNode.buildRoot(assignments, instantiateNode);
    RootNode rootNode =
        MethodRootNode.buildConstructor(
            language, localScope, scopeBuilder.asModuleScope(), instantiateBlock, section, this);
    RootCallTarget callTarget = rootNode.getCallTarget();
    var schemaBldr = FunctionSchema.newBuilder().annotations(annotations).argumentDefinitions(args);
    if (type.hasAllConstructorsPrivate()) {
      schemaBldr.projectPrivate();
    }
    return new Function(callTarget, null, schemaBldr.build());
  }

  private Function generateQualifiedAccessor(EnsoLanguage lang, ModuleScope.Builder scopeBuilder) {
    var node = new QualifiedAccessorNode(lang, this, getDefinitionScope());
    var callTarget = node.getCallTarget();
    var schemaBldr =
        FunctionSchema.newBuilder()
            .argumentDefinitions(
                new ArgumentDefinition(
                    0, "self", null, null, ArgumentDefinition.ExecutionMode.EXECUTE));
    if (type.hasAllConstructorsPrivate()) {
      schemaBldr.projectPrivate();
    }
    var function = new Function(callTarget, null, schemaBldr.build());
    scopeBuilder.registerMethod(type.getEigentype(), this.name, function);
    return function;
  }

  /**
   * Gets the name of the constructor.
   *
   * @return the name of the Atom constructor
   */
  public String getName() {
    return name;
  }

  /**
   * Gets the display name of the constructor. If the name is Value or Error will include the type
   * name as well.
   *
   * @return the name to display of the Atom constructor
   */
  @TruffleBoundary
  public String getDisplayName() {
    return name.equals("Value") || name.equals("Error") || name.equals("Warning")
        ? type.getName() + "." + name
        : name;
  }

  /**
   * Gets the scope in which this constructor was defined.
   *
   * @return the scope in which this constructor was defined
   */
  public ModuleScope getDefinitionScope() {
    return definitionModule.getScope();
  }

  /**
   * Gets the number of arguments expected by the constructor.
   *
   * @return the number of args expected by the constructor.
   */
  public int getArity() {
    return fieldNames.length;
  }

  /**
   * Creates a new runtime instance of the Atom represented by this constructor.
   *
   * @param arguments the runtime arguments to the constructor
   * @return a new instance of the atom represented by this constructor
   * @see AtomNewInstanceNode
   */
  final Atom newInstance(Object... arguments) {
    // package private on purpose
    // use AtomNewInstanceNode to create new instances
    if (cachedInstance != null) {
      return cachedInstance;
    }
    return AtomConstructorInstanceNode.uncached(null, this, arguments);
  }

  /**
   * Creates a textual representation of this Atom constructor, useful for debugging.
   *
   * @return a textual representation of this Atom constructor
   */
  @Override
  public String toString() {
    return name;
  }

  /**
   * Gets the constructor function of this constructor.
   *
   * @return the constructor function of this constructor.
   */
  public Function getConstructorFunction() {
    if (constructorFunction == null) {
      CompilerDirectives.transferToInterpreterAndInvalidate();
      constructorFunction = constructorFunctionSupplier.get();
    }
    return constructorFunction;
  }

  /**
   * Gets the qualified accessor function of this constructor.
   *
   * @return the accessor function of this constructor.
   */
  public Function getAccessorFunction() {
    return accessor;
  }

  /**
   * Extracts constructor from given {@link #getAccessorFunction() accessor function}.
   *
   * @param fn the function to check
   * @return associated constructor or {@code null} if the function isn't {@link
   *     #getAccessorFunction() accessor function}.
   */
  public static AtomConstructor accessorFor(Function fn) {
    if (fn.getCallTarget().getRootNode() instanceof QualifiedAccessorNode node) {
      return node.getAtomConstructor();
    } else {
      return null;
    }
  }

  /**
   * Creates field accessors for all fields in all constructors from the given type.
   *
   * @param language the language instance to create getters for
   * @param type type to create accessors for
   * @return map from names to accessor root nodes
   */
  @TruffleBoundary
  public static Map<String, RootNode> collectFieldAccessors(EnsoLanguage language, Type type) {
    var constructors = type.getConstructors().values();
    var roots = new TreeMap<String, RootNode>();
    if (constructors.size() > 1) {
      var names = new TreeMap<String, List<GetFieldWithMatchNode.GetterPair>>();
      // We assume that all the constructors have the same definition scope. So we
      // take just the first one.
      var moduleScope = constructors.iterator().next().getDefinitionScope();
      for (var cons : constructors) {
        final var fieldNames = cons.getFieldNames();
        for (var i = 0; i < fieldNames.length; i++) {
          var items = names.computeIfAbsent(fieldNames[i], (k) -> new ArrayList<>());
          items.add(new GetFieldWithMatchNode.GetterPair(cons, i));
        }
      }
      for (var entry : names.entrySet()) {
        var name = entry.getKey();
        var fields = entry.getValue();
        roots.put(
            name,
            new GetFieldWithMatchNode(
                language,
                name,
                Type.noType(),
                moduleScope,
                fields.toArray(new GetFieldWithMatchNode.GetterPair[0])));
      }
    } else if (constructors.size() == 1) {
      var cons = constructors.toArray(AtomConstructor[]::new)[0];
      final var fieldNames = cons.getFieldNames();
      for (var i = 0; i < fieldNames.length; i++) {
        var node = new GetFieldNode(language, i, type, fieldNames[i], cons.getDefinitionScope());
        roots.put(fieldNames[i], node);
      }
    }
    return roots;
  }

  final Layout[] getUnboxingLayouts() {
    return unboxingLayouts;
  }

  final Layout getBoxedLayout() {
    if (boxedLayout == null) {
      CompilerDirectives.transferToInterpreterAndInvalidate();
      boxedLayout = boxedLayoutSupplier.get();
    }
    return boxedLayout;
  }

  /**
   * Adds a layout, if the caller knows the latest version of the layouts array. This is verified by
   * checking the layout count they know about. This is enough, because the array is append-only.
   *
   * @param layout the layout to add
   * @param knownLayoutCount the number of layouts the caller knows about
   */
  public void atomicallyAddLayout(Layout layout, int knownLayoutCount) {
    layoutsLock.lock();
    try {
      if (unboxingLayouts.length != knownLayoutCount) {
        // client has outdated information and should re-fetch.
        return;
      }
      var newLayouts = new Layout[unboxingLayouts.length + 1];
      System.arraycopy(unboxingLayouts, 0, newLayouts, 0, unboxingLayouts.length);
      newLayouts[unboxingLayouts.length] = layout;
      unboxingLayouts = newLayouts;
    } finally {
      layoutsLock.unlock();
    }
  }

  /**
   * Marks this object as instantiable through the polyglot APIs.
   *
   * @return {@code true}
   */
  @ExportMessage
  boolean isInstantiable() {
    return true;
  }

  /**
   * Handles instantiation through the polyglot APIs.
   *
   * @param arguments the field values for the new instance.
   * @return an instance of this constructor with expected fields.
   * @throws ArityException when the provided field count does match this constructor's field count.
   */
  @ExportMessage
  Atom instantiate(Object... arguments) throws ArityException {
    int expected_arity = getArity();
    if (arguments.length != expected_arity) {
      throw ArityException.create(expected_arity, expected_arity, arguments.length);
    }
    if (cachedInstance != null) {
      return cachedInstance;
    }
    return newInstance(arguments);
  }

  @ExportMessage
  @TruffleBoundary
  @Override
  public String toDisplayString(boolean allowSideEffects) {
    var sb = new StringBuilder();
    sb.append("Constructor<").append(getDisplayName()).append(">");
    for (var f : getFields()) {
      if (!f.hasDefaultValue()) {
        sb.append(" ").append(f.getName()).append("=_");
      }
    }
    return sb.toString();
  }

  /**
   * @return the fully qualified name of this constructor.
   */
  @TruffleBoundary
  public QualifiedName getQualifiedName() {
    return type.getQualifiedName().createChild(getName());
  }

  /**
   * @return the fully qualified name of constructor type.
   */
  @CompilerDirectives.TruffleBoundary
  public QualifiedName getQualifiedTypeName() {
    return type.getQualifiedName();
  }

  /**
   * Definitions of this constructor fields.
   *
   * @return the fields defined by this constructor.
   */
  public ArgumentDefinition[] getFields() {
    return getConstructorFunction().getSchema().getArgumentInfos();
  }

  /**
   * Names of this constructor fields.
   *
   * @return the field names defined by this constructor.
   */
  public String[] getFieldNames() {
    return fieldNames;
  }

  /**
   * Type associated with this constructor.
   *
   * @return type this constructor constructs
   */
  @ExportMessage.Ignore
  public Type getType() {
    return type;
  }

  @ExportMessage
  boolean hasType() {
    return true;
  }

  @ExportMessage
  Type getType(@Bind("$node") Node node) {
    return EnsoContext.get(node).getBuiltins().function();
  }

  @ExportMessage
  boolean hasMetaObject() {
    return true;
  }

  @ExportMessage
  Type getMetaObject(@Bind("$node") Node node) {
    return EnsoContext.get(node).getBuiltins().function();
  }
}
