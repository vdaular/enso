package org.enso.base.read;

import java.util.ServiceLoader;
import org.enso.base.polyglot.EnsoMeta;
import org.graalvm.polyglot.Value;

public abstract class ReadManyReturnSPI {
  private static final ServiceLoader<ReadManyReturnSPI> loader =
      ServiceLoader.load(ReadManyReturnSPI.class, ReadManyReturnSPI.class.getClassLoader());

  public static Value[] get_types(boolean refresh) {
    if (refresh) {
      loader.reload();
    }
    return loader.stream().map(provider -> provider.get().getTypeObject()).toArray(Value[]::new);
  }

  public Value getTypeObject() {
    return EnsoMeta.getType(getModuleName(), getTypeName());
  }

  protected abstract String getModuleName();

  protected abstract String getTypeName();
}
