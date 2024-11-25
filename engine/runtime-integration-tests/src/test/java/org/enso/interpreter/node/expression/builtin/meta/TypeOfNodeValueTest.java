package org.enso.interpreter.node.expression.builtin.meta;

import static org.junit.Assert.assertEquals;

import com.oracle.truffle.api.RootCallTarget;
import org.enso.interpreter.runtime.callable.UnresolvedConstructor;
import org.enso.interpreter.runtime.callable.UnresolvedSymbol;
import org.enso.interpreter.runtime.data.Type;
import org.enso.interpreter.runtime.library.dispatch.TypeOfNode;
import org.enso.test.utils.ContextUtils;
import org.enso.test.utils.TestRootNode;
import org.graalvm.polyglot.Context;
import org.junit.AfterClass;
import org.junit.Test;

public class TypeOfNodeValueTest {
  private static RootCallTarget testTypesCall;
  private static Context ctx;

  private static Context ctx() {
    if (ctx == null) {
      ctx = ContextUtils.defaultContextBuilder().build();
      ContextUtils.executeInContext(
          ctx,
          () -> {
            var node = TypeOfNode.create();
            var root =
                new TestRootNode(
                    (frame) -> {
                      var arg = frame.getArguments()[0];
                      var t = node.findTypeOrError(arg);
                      var all = node.findAllTypesOrNull(arg);
                      return new Object[] {t, all};
                    });
            root.insertChildren(node);
            testTypesCall = root.getCallTarget();
            return null;
          });
    }
    return ctx;
  }

  @AfterClass
  public static void disposeCtx() throws Exception {
    if (ctx != null) {
      ctx.close();
      ctx = null;
    }
  }

  @Test
  public void typeOfUnresolvedConstructor() {
    ContextUtils.executeInContext(
        ctx(),
        () -> {
          var cnstr = UnresolvedConstructor.build(null, "Unknown_Name");
          var arr = (Object[]) testTypesCall.call(cnstr);
          var type = (Type) arr[0];
          var allTypes = (Type[]) arr[1];
          assertEquals("Function", type.getName());
          assertEquals("One array", 1, allTypes.length);
          assertEquals("Also function type", type, allTypes[0]);
          return null;
        });
  }

  @Test
  public void typeOfUnresolvedSymbol() {
    ContextUtils.executeInContext(
        ctx(),
        () -> {
          var cnstr = UnresolvedSymbol.build("Unknown_Name", null);
          var arr = (Object[]) testTypesCall.call(cnstr);
          var type = (Type) arr[0];
          var allTypes = (Type[]) arr[1];
          assertEquals("Function", type.getName());
          assertEquals("One array", 1, allTypes.length);
          assertEquals("Also function type", type, allTypes[0]);
          return null;
        });
  }
}
