package org.enso.aws.file_system;

import org.enso.base.enso_cloud.DataLinkSPI;

@org.openide.util.lookup.ServiceProvider(service = DataLinkSPI.class)
public final class S3DataLinkImpl extends DataLinkSPI {
  @Override
  protected String getModuleName() {
    return "Standard.AWS.S3.S3_Data_Link";
  }

  @Override
  protected String getTypeName() {
    return "S3_Data_Link";
  }

  @Override
  protected String getLinkTypeName() {
    return "S3";
  }
}
