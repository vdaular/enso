package org.enso.test.utils;

import com.oracle.truffle.api.interop.InteropLibrary;
import com.oracle.truffle.api.interop.TruffleObject;
import com.oracle.truffle.api.library.ExportLibrary;
import com.oracle.truffle.api.library.ExportMessage;
import java.io.OutputStream;
import java.nio.file.Paths;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.logging.Level;
import org.enso.common.LanguageInfo;
import org.enso.common.MethodNames.Module;
import org.enso.common.MethodNames.TopScope;
import org.enso.interpreter.runtime.EnsoContext;
import org.enso.polyglot.RuntimeOptions;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Language;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.Value;
import org.graalvm.polyglot.io.IOAccess;
import org.graalvm.polyglot.proxy.ProxyExecutable;

/**
 * A collection of classes and methods useful for testing {@link Context} related stuff.
 */
public final class ContextUtils {
  private ContextUtils() {}

  public static Context createDefaultContext() {
    var context = defaultContextBuilder().build();
    final Map<String, Language> langs = context.getEngine().getLanguages();
    assert langs.get("enso") != null : "Enso found in languages: " + langs;
    return context;
  }

  public static Context createDefaultContext(OutputStream out) {
    var context = defaultContextBuilder().out(out).build();
    final Map<String, Language> langs = context.getEngine().getLanguages();
    assert langs.get("enso") != null : "Enso found in languages: " + langs;
    return context;
  }

  public static Context.Builder defaultContextBuilder(String... languages) {
    return Context.newBuilder(languages)
        .allowExperimentalOptions(true)
        .allowIO(IOAccess.ALL)
        .allowAllAccess(true)
        .option(RuntimeOptions.LOG_LEVEL, Level.WARNING.getName())
        .option(RuntimeOptions.DISABLE_IR_CACHES, "true")
        .logHandler(System.err)
        .option(RuntimeOptions.STRICT_ERRORS, "true")
        .option(
            RuntimeOptions.LANGUAGE_HOME_OVERRIDE,
            Paths.get("../../distribution/component").toFile().getAbsolutePath());
  }

  public static EnsoContext leakContext(Context ctx) {
    return ctx.getBindings(LanguageInfo.ID)
        .invokeMember(TopScope.LEAK_CONTEXT)
        .as(EnsoContext.class);
  }

  /**
   * Executes the given callable in the given context. A necessity for executing artificially
   * created Truffle ASTs.
   *
   * @return Object returned from {@code callable} wrapped in {@link Value}.
   */
  public static Value executeInContext(Context ctx, Callable<Object> callable) {
    // Force initialization of the context
    ctx.eval("enso", "value = 0");
    var err = new Exception[1];
    ctx.getPolyglotBindings()
        .putMember(
            "testSymbol",
            (ProxyExecutable)
                (Value... args) -> {
                  try {
                    return callable.call();
                  } catch (Exception e) {
                    err[0] = e;
                    return null;
                  }
                });
    var res = ctx.getPolyglotBindings().getMember("testSymbol").execute();
    if (err[0] != null) {
      throw raise(RuntimeException.class, err[0]);
    }
    return res;
  }


  @SuppressWarnings("unchecked")
  private static <E extends Throwable> E raise(Class<E> clazz, Throwable t) throws E {
    throw (E) t;
  }

  /**
   * Unwraps the `receiver` field from the Value. This is a hack to allow us to test execute methods
   * of artificially created ASTs, e.g., single nodes. More specifically, only unwrapped values are
   * eligible to be passed to node's execute methods, we cannot pass {@link Value} directly to the
   * node's execute methods.
   *
   * <p>Does something similar to what {@link
   * com.oracle.truffle.tck.DebuggerTester#getSourceImpl(Source)} does, but uses a different hack
   * than reflective access.
   */
  public static Object unwrapValue(Context ctx, Value value) {
    var unwrapper = new Unwrapper();
    var unwrapperValue = ctx.asValue(unwrapper);
    unwrapperValue.execute(value);
    assert unwrapper.args != null;
    return unwrapper.args[0];
  }

  /**
   * Creates an Enso value from the given source.
   *
   * @param src One-line assignment into a variable
   * @param imports Imports, may be empty.
   */
  public static Value createValue(Context ctx, String src, String imports) {
    if (src.lines().count() > 1 || imports == null) {
      throw new IllegalArgumentException("src should have one line, imports must not be null");
    }
    var sb = new StringBuilder();
    sb.append(imports);
    sb.append(System.lineSeparator());
    sb.append("my_var = ").append(src);
    sb.append(System.lineSeparator());
    Value tmpModule = ctx.eval("enso", sb.toString());
    return tmpModule.invokeMember(Module.EVAL_EXPRESSION, "my_var");
  }

  public static Value createValue(Context ctx, String src) {
    return createValue(ctx, src, "");
  }

  /**
   * Evaluates the given source as if it was in an unnamed module.
   *
   * @param src The source code of the module
   * @return The value returned from the main method of the unnamed module.
   */
  public static Value evalModule(Context ctx, String src) {
    Value module = ctx.eval(Source.create("enso", src));
    Value assocType = module.invokeMember(Module.GET_ASSOCIATED_TYPE);
    Value mainMethod = module.invokeMember(Module.GET_METHOD, assocType, "main");
    return mainMethod.execute();
  }

  /**
   * Parses the given module and returns a method by the given name from the module.
   *
   * @param moduleSrc Source of the whole module
   * @return Reference to the method.
   */
  public static Value getMethodFromModule(Context ctx, String moduleSrc, String methodName) {
    Value module = ctx.eval(Source.create("enso", moduleSrc));
    return module.invokeMember(Module.EVAL_EXPRESSION, methodName);
  }

  @ExportLibrary(InteropLibrary.class)
  static final class Unwrapper implements TruffleObject {
    Object[] args;

    @ExportMessage
    Object execute(Object[] args) {
      this.args = args;
      return this;
    }

    @ExportMessage
    boolean isExecutable() {
      return true;
    }
  }
}