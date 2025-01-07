package org.enso.runtimeversionmanager.runner

import org.enso.cli.OS
import org.enso.distribution.{DistributionManager, Environment}
import org.enso.runtimeversionmanager.components.Engine

import java.nio.file.Path

case class NativeExecCommand(executablePath: Path) extends ExecCommand {
  override def path: String = executablePath.toString

  override def cmdArguments(
    engine: Engine,
    jvmSettings: JVMSettings
  ): Seq[String] =
    Seq("-Dcom.oracle.graalvm.isaot=true")

  override def javaHome: Option[String] = None
}

object NativeExecCommand {
  def apply(version: String): Option[NativeExecCommand] = {
    val env      = new Environment() {}
    val dm       = new DistributionManager(env)
    val execName = OS.executableName("enso")
    val fullExecPath =
      dm.paths.engines.resolve(version).resolve("bin").resolve(execName)

    if (fullExecPath.toFile.exists()) Some(NativeExecCommand(fullExecPath))
    else None
  }
}
