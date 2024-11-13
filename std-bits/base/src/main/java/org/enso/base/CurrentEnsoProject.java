package org.enso.base;

import org.enso.base.polyglot.EnsoMeta;
import org.graalvm.polyglot.Value;

/** A Java interface to the `Enso_Project` type. */
public final class CurrentEnsoProject {
  private final String name;
  private final String namespace;
  private final String rootPath;

  private static CurrentEnsoProject cached = null;
  private static boolean isCached = false;

  private CurrentEnsoProject(String name, String namespace, String rootPath) {
    this.name = name;
    this.namespace = namespace;
    this.rootPath = rootPath;
  }

  public static CurrentEnsoProject get() {
    if (!isCached) {
      Value ensoProject =
          EnsoMeta.callStaticModuleMethod("Standard.Base.Meta.Enso_Project", "enso_project");
      if (ensoProject.hasMember("name")
          && ensoProject.hasMember("namespace")
          && ensoProject.hasMember("root_path")) {
        Value namespace = ensoProject.invokeMember("namespace");
        Value name = ensoProject.invokeMember("name");
        Value rootPath = ensoProject.invokeMember("root_path");
        if (namespace == null || name == null || rootPath == null) {
          cached = null;
        } else {
          cached =
              new CurrentEnsoProject(name.asString(), namespace.asString(), rootPath.asString());
        }
      } else {
        cached = null;
      }

      isCached = true;
    }

    return cached;
  }

  public String getName() {
    return name;
  }

  public String getNamespace() {
    return namespace;
  }

  public String getRootPath() {
    return rootPath;
  }

  public String fullName() {
    return namespace + "." + name;
  }
}
