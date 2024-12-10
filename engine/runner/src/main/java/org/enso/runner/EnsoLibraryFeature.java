package org.enso.runner;

import static scala.jdk.javaapi.CollectionConverters.asJava;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.TreeSet;
import org.enso.compiler.core.EnsoParser;
import org.enso.compiler.core.ir.module.scope.imports.Polyglot;
import org.enso.pkg.PackageManager$;
import org.graalvm.nativeimage.hosted.Feature;
import org.graalvm.nativeimage.hosted.RuntimeProxyCreation;
import org.graalvm.nativeimage.hosted.RuntimeReflection;
import org.graalvm.nativeimage.hosted.RuntimeResourceAccess;

public final class EnsoLibraryFeature implements Feature {
  @Override
  public void beforeAnalysis(BeforeAnalysisAccess access) {
    try {
      registerOpenCV(access.getApplicationClassLoader());
    } catch (ReflectiveOperationException ex) {
      ex.printStackTrace();
      throw new IllegalStateException(ex);
    }
    var libs = new LinkedHashSet<Path>();
    for (var p : access.getApplicationClassPath()) {
      var p1 = p.getParent();
      if (p1 != null && p1.getFileName().toString().equals("java")) {
        var p2 = p1.getParent();
        if (p2 != null
            && p2.getFileName().toString().equals("polyglot")
            && p2.getParent() != null) {
          libs.add(p2.getParent());
        }
      }
    }

    /*
      To run Standard.Test one shall analyze its polyglot/java files. But there are none
      to include on classpath as necessary test classes are included in Standard.Base!
      We can locate the Test library by following code or we can make sure all necessary
      imports are already mentioned in Standard.Base itself.

    if (!libs.isEmpty()) {
      var f = libs.iterator().next();
      var stdTest = f.getParent().getParent().resolve("Test").resolve(f.getFileName());
      if (stdTest.toFile().exists()) {
        libs.add(stdTest);
      }
      System.err.println("Testing library: " + stdTest);
    }
    */

    var classes = new TreeSet<String>();
    try {
      for (var p : libs) {
        var result = PackageManager$.MODULE$.Default().loadPackage(p.toFile());
        if (result.isSuccess()) {
          var pkg = result.get();
          for (var src : pkg.listSourcesJava()) {
            var code = Files.readString(src.file().toPath());
            var ir = EnsoParser.compile(code);
            for (var imp : asJava(ir.imports())) {
              if (imp instanceof Polyglot poly && poly.entity() instanceof Polyglot.Java entity) {
                var name = new StringBuilder(entity.getJavaName());
                Class<?> clazz;
                for (; ; ) {
                  clazz = access.findClassByName(name.toString());
                  if (clazz != null) {
                    break;
                  }
                  int at = name.toString().lastIndexOf('.');
                  if (at < 0) {
                    throw new IllegalStateException("Cannot load " + entity.getJavaName());
                  }
                  name.setCharAt(at, '$');
                }
                classes.add(clazz.getName());
                RuntimeReflection.register(clazz);
                RuntimeReflection.register(clazz.getConstructors());
                RuntimeReflection.register(clazz.getMethods());
                RuntimeReflection.register(clazz.getFields());
                RuntimeReflection.registerAllConstructors(clazz);
                RuntimeReflection.registerAllFields(clazz);
                RuntimeReflection.registerAllMethods(clazz);
                if (clazz.isInterface()) {
                  RuntimeProxyCreation.register(clazz);
                }
              }
            }
          }
        }
      }
    } catch (Exception ex) {
      ex.printStackTrace();
      throw new IllegalStateException(ex);
    }
    System.err.println("Summary for polyglot import java:");
    for (var className : classes) {
      System.err.println("  " + className);
    }
    System.err.println("Registered " + classes.size() + " classes for reflection");
  }

  private static void registerOpenCV(ClassLoader cl) throws ReflectiveOperationException {
    var moduleOpenCV = cl.getUnnamedModule();
    var currentOS = System.getProperty("os.name").toUpperCase().replaceAll(" .*$", "");

    var libOpenCV =
        switch (currentOS) {
          case "LINUX" -> "nu/pattern/opencv/linux/x86_64/libopencv_java470.so";
          case "WINDOWS" -> "nu/pattern/opencv/windows/x86_64/opencv_java470.dll";
          case "MAC" -> {
            var arch = System.getProperty("os.arch").toUpperCase();
            yield switch (arch) {
              case "X86_64" -> "nu/pattern/opencv/osx/x86_64/libopencv_java470.dylib";
              case "AARCH64" -> "nu/pattern/opencv/osx/ARMv8/libopencv_java470.dylib";
              default -> null;
            };
          }
          default -> null;
        };

    if (libOpenCV != null) {
      var verify = cl.getResource(libOpenCV);
      if (verify == null) {
        throw new IllegalStateException("Cannot find " + libOpenCV + " resource in " + cl);
      }
      RuntimeResourceAccess.addResource(moduleOpenCV, libOpenCV);
    } else {
      throw new IllegalStateException("No resource suggested for " + currentOS);
    }
  }
}
