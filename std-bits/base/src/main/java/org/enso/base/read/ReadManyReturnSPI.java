package org.enso.base.read;

import java.util.ServiceLoader;
import org.enso.base.polyglot.EnsoMeta;
import org.graalvm.polyglot.Value;

/**
 * An SPI for specifying return types to the `read_many` operation.
 *
 * <p>The `read_many` operation can take return types provided from various libraries. This SPI
 * ensures that it can be aware of all the available types from the loaded libraries. If a library
 * registers a return type here, it will be available for autoscoping resolution and will appear in
 * the dropdown. Registered types must provide methods `get_dropdown_options`, `resolve` and
 * `make_return`. See `Standard.Base.Data.Read.Return_As` for examples.
 */
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
