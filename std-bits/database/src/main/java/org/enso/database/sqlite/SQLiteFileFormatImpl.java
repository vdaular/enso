package org.enso.database.sqlite;

import org.enso.base.file_format.FileFormatSPI;

@org.openide.util.lookup.ServiceProvider(service = FileFormatSPI.class)
public final class SQLiteFileFormatImpl extends FileFormatSPI {
  @Override
  protected String getModuleName() {
    return "Standard.Database.Connection.SQLite_Format";
  }

  @Override
  protected String getTypeName() {
    return "SQLite_Format";
  }
}
