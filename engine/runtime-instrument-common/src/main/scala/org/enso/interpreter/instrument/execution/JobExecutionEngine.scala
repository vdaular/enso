package org.enso.interpreter.instrument.execution

import com.oracle.truffle.api.TruffleLogger
import org.enso.common.Asserts.assertInJvm
import org.enso.interpreter.instrument.InterpreterContext
import org.enso.interpreter.instrument.job.{BackgroundJob, Job, UniqueJob}
import org.enso.text.Sha3_224VersionCalculator

import java.util
import java.util.{Collections, UUID}
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.{ExecutorService, TimeUnit}
import java.util.logging.Level
import scala.concurrent.{Future, Promise, TimeoutException}
import scala.util.control.NonFatal

/** This component schedules the execution of jobs. It keeps a queue of
  * pending jobs and activates job execution in FIFO order.
  *
  * @param interpreterContext suppliers of services that provide interpreter
  * specific functionality
  * @param executionState a state of the runtime
  * @param locking locking capability for runtime
  */
final class JobExecutionEngine(
  interpreterContext: InterpreterContext,
  executionState: ExecutionState,
  locking: Locking
) extends JobProcessor
    with JobControlPlane {

  private val runningJobsRef =
    new AtomicReference[Vector[RunningJob]](Vector.empty)

  private val backgroundJobsRef =
    new AtomicReference[Vector[RunningJob]](Vector.empty)

  private val context = interpreterContext.executionService.getContext

  private val pendingCancellationsExecutor =
    context.newFixedThreadPool(1, "pending-cancellations", false)

  private val jobParallelism = context.getJobParallelism

  private var isBackgroundJobsStarted = false

  private val delayedBackgroundJobsQueue =
    new util.ArrayList[BackgroundJob[_]](4096)

  val jobExecutor: ExecutorService =
    context.newFixedThreadPool(jobParallelism, "job-pool", false)

  private val MaxJobLimit =
    Integer.MAX_VALUE // Temporary solution to avoid jobs being dropped

  val highPriorityJobExecutor: ExecutorService =
    context.newCachedThreadPool(
      "prioritized-job-pool",
      2,
      4,
      MaxJobLimit,
      false
    )

  private val backgroundJobExecutor: ExecutorService =
    context.newCachedThreadPool("background-job-pool", 1, 4, MaxJobLimit, false)

  private val runtimeContext =
    RuntimeContext(
      executionService  = interpreterContext.executionService,
      contextManager    = interpreterContext.contextManager,
      endpoint          = interpreterContext.endpoint,
      truffleContext    = interpreterContext.truffleContext,
      jobProcessor      = this,
      jobControlPlane   = this,
      locking           = locking,
      state             = executionState,
      versionCalculator = Sha3_224VersionCalculator
    )

  private lazy val logger: TruffleLogger =
    runtimeContext.executionService.getLogger

  // Independent Runnable that has a list of jobs that should finish within a pre-determined window
  // and, if not, are interrupted.
  private class ForceJobCancellations(val pendingJobs: Seq[(Long, RunningJob)])
      extends Runnable {
    private val forceInterruptTimeout: Long = 50 * 1000

    override def run(): Unit = {
      pendingJobs.sortBy(_._1).foreach {
        case (timeRequestedToCancel, runningJob) =>
          try {
            val now                        = System.currentTimeMillis()
            val timeSinceRequestedToCancel = now - timeRequestedToCancel
            assertInJvm(timeSinceRequestedToCancel > 0)
            val timeToCancel =
              forceInterruptTimeout - timeSinceRequestedToCancel
            logger.log(
              Level.FINEST,
              "About to wait {}ms  to cancel job {}",
              Array[Any](
                timeToCancel,
                runningJob.id
              )
            )
            runningJob.future.get(timeToCancel, TimeUnit.MILLISECONDS)
            logger.log(
              Level.FINEST,
              "Job {} finished within the allocated soft-cancel time"
            )
          } catch {
            case _: TimeoutException =>
              val sb = new StringBuilder(
                "Threaddump when timeout is reached while waiting for the job " + runningJob.id + " running in thread " + runningJob.job
                  .threadNameExecutingJob() + " to cancel:\n"
              )
              Thread.getAllStackTraces.entrySet.forEach { entry =>
                sb.append(entry.getKey.getName).append("\n")
                entry.getValue.foreach { e =>
                  sb.append("    ")
                    .append(e.getClassName)
                    .append(".")
                    .append(e.getMethodName)
                    .append("(")
                    .append(e.getFileName)
                    .append(":")
                    .append(e.getLineNumber)
                    .append(")\n")
                }
              }
              logger.log(Level.WARNING, sb.toString())
              runningJob.future.cancel(runningJob.job.mayInterruptIfRunning)
            case e: Throwable =>
              logger.log(
                Level.WARNING,
                "Encountered exception while waiting on status of pending jobs",
                e
              )
          }
      }
    }
  }

  private def maybeForceCancelRunningJob(
    runningJob: RunningJob,
    softAbortFirst: Boolean
  ): Option[RunningJob] = {
    val delayJobCancellation =
      runningJob.job.mayInterruptIfRunning && softAbortFirst || !runningJob.job
        .hasStarted()
    if (delayJobCancellation) {
      Some(runningJob)
    } else {
      runningJob.future.cancel(runningJob.job.mayInterruptIfRunning)
      None
    }
  }

  /** @inheritdoc */
  override def runBackground[A](job: BackgroundJob[A]): Unit =
    synchronized {
      if (isBackgroundJobsStarted) {
        cancelDuplicateJobs(job, backgroundJobsRef)
        runInternal(job, backgroundJobExecutor, backgroundJobsRef)
      } else {
        job match {
          case job: UniqueJob[_] =>
            delayedBackgroundJobsQueue.removeIf {
              case that: UniqueJob[_] => that.equalsTo(job)
              case _                  => false
            }
          case _ =>
        }
        delayedBackgroundJobsQueue.add(job)
      }
    }

  /** @inheritdoc */
  override def run[A](job: Job[A]): Future[A] = {
    cancelDuplicateJobs(job, runningJobsRef)
    val executor =
      if (job.highPriority) highPriorityJobExecutor else jobExecutor
    runInternal(job, executor, runningJobsRef)
  }

  private def cancelDuplicateJobs[A](
    job: Job[A],
    runningJobsRef: AtomicReference[Vector[RunningJob]]
  ): Unit = {
    job match {
      case job: UniqueJob[_] =>
        val allJobs =
          runningJobsRef.updateAndGet(_.filterNot(_.future.isCancelled))
        allJobs.foreach { runningJob =>
          runningJob.job match {
            case jobRef: UniqueJob[_] if jobRef.equalsTo(job) =>
              logger
                .log(Level.FINEST, s"Cancelling duplicate job [$jobRef].")
              updatePendingCancellations(
                maybeForceCancelRunningJob(
                  runningJob,
                  softAbortFirst = true
                ).toSeq
              )
            case _ =>
          }
        }
      case _ =>
    }
  }

  private def updatePendingCancellations(
    jobsToCancel: Seq[RunningJob]
  ): Unit = {
    val at = System.currentTimeMillis()
    if (jobsToCancel.nonEmpty) {
      logger.log(
        Level.FINEST,
        "Submitting {0} job(s) for future cancellation",
        jobsToCancel.map(j => (j.job.getClass, j.id))
      )
    }
    if (jobsToCancel.nonEmpty)
      pendingCancellationsExecutor.submit(
        new ForceJobCancellations(jobsToCancel.map((at, _)))
      )
  }

  private def runInternal[A](
    job: Job[A],
    executorService: ExecutorService,
    runningJobsRef: AtomicReference[Vector[RunningJob]]
  ): Future[A] = {
    val jobId   = UUID.randomUUID()
    val promise = Promise[A]()
    logger.log(
      Level.FINE,
      s"Submitting job: {0} with {1} id...",
      Array[AnyRef](job, jobId)
    )
    val future = executorService.submit(() => {
      logger.log(Level.FINE, s"Executing job: {0}...", job)
      val before = System.currentTimeMillis()
      try {
        val result = job.run(runtimeContext)
        val took   = System.currentTimeMillis() - before
        logger.log(
          Level.FINE,
          s"Job {0} finished in {1} ms.",
          Array[Any](job, took)
        )
        promise.success(result)
      } catch {
        case NonFatal(ex) =>
          logger.log(Level.SEVERE, s"Error executing $job", ex)
          promise.failure(ex)
        case _: InterruptedException =>
          logger.log(Level.WARNING, s"$job got interrupted")
        case err: Throwable =>
          logger.log(Level.SEVERE, s"Error executing $job", err)
          throw err
      } finally {
        val remaining = runningJobsRef.updateAndGet(_.filterNot(_.id == jobId))
        logger.log(
          Level.FINEST,
          "Number of remaining pending jobs: {0}",
          remaining.size
        )
      }
    })
    job.setJobId(jobId)
    val runningJob = RunningJob(jobId, job, future)

    val queue = runningJobsRef.updateAndGet(_ :+ runningJob)
    logger.log(Level.FINE, "Number of pending jobs: {0}", queue.size)

    promise.future
  }

  /** @inheritdoc */
  override def abortAllJobs(reason: String): Unit =
    abortAllExcept(reason)

  /** @inheritdoc */
  override def abortAllExcept(
    reason: String,
    ignoredJobs: Class[_ <: Job[_]]*
  ): Unit = {
    val allJobs = runningJobsRef.updateAndGet(_.filterNot(_.future.isCancelled))
    val cancellableJobs = allJobs
      .filter { runningJob =>
        runningJob.job.isCancellable &&
        !ignoredJobs.contains(runningJob.job.getClass)
      }
    logger.log(
      Level.FINE,
      "Aborting {0} jobs because {1}: {2}",
      Array[Any](cancellableJobs.length, reason, cancellableJobs.map(_.id))
    )

    val pending = cancellableJobs.flatMap(
      maybeForceCancelRunningJob(_, softAbortFirst = true)
    )
    updatePendingCancellations(pending)
    runtimeContext.executionService.getContext.getThreadManager
      .interruptThreads()
  }

  /** @inheritdoc */
  override def abortJobs(
    contextId: UUID,
    reason: String,
    softAbortFirst: Boolean,
    toAbort: Class[_ <: Job[_]]*
  ): Unit = {
    val allJobs     = runningJobsRef.get()
    val contextJobs = allJobs.filter(_.job.contextIds.contains(contextId))
    val pending = contextJobs
      .flatMap { runningJob =>
        if (
          runningJob.job.isCancellable && (toAbort.isEmpty || toAbort
            .contains(runningJob.getClass))
        ) {
          logger.log(
            Level.FINE,
            "Aborting job {0} because {1}",
            Array[Any](runningJob.id, reason)
          )
          Some(runningJob)
        } else None
      }
      .flatMap(maybeForceCancelRunningJob(_, softAbortFirst))
    updatePendingCancellations(pending)
    runtimeContext.executionService.getContext.getThreadManager
      .interruptThreads()
  }

  /** @inheritdoc */
  override def abortJobs(
    contextId: UUID,
    reason: String,
    accept: java.util.function.Function[Job[_], java.lang.Boolean]
  ): Unit = {
    val allJobs     = runningJobsRef.get()
    val contextJobs = allJobs.filter(_.job.contextIds.contains(contextId))
    val pending = contextJobs
      .flatMap { runningJob =>
        if (runningJob.job.isCancellable && accept.apply(runningJob.job)) {
          logger.log(
            Level.FINE,
            "Aborting job {0} because {1}",
            Array[Any](runningJob.id, reason)
          )
          Some(runningJob)
        } else None
      }
      .flatMap(maybeForceCancelRunningJob(_, softAbortFirst = true))
    updatePendingCancellations(pending)
    runtimeContext.executionService.getContext.getThreadManager
      .interruptThreads()
  }

  override def abortBackgroundJobs(
    reason: String,
    toAbort: Class[_ <: Job[_]]*
  ): Unit = {
    val allJobs =
      backgroundJobsRef.updateAndGet(_.filterNot(_.future.isCancelled))
    val cancellableJobs = allJobs
      .filter { runningJob =>
        runningJob.job.isCancellable &&
        toAbort.contains(runningJob.job.getClass)
      }
    logger.log(
      Level.FINE,
      "Aborting {0} background jobs because {1}: {2}",
      Array[Any](cancellableJobs.length, reason, cancellableJobs.map(_.id))
    )
    val pending = cancellableJobs.flatMap(
      maybeForceCancelRunningJob(_, softAbortFirst = true)
    )
    updatePendingCancellations(pending)
  }

  /** @inheritdoc */
  override def startBackgroundJobs(): Boolean =
    synchronized {
      val result = !isBackgroundJobsStarted
      isBackgroundJobsStarted = true
      submitBackgroundJobsOrdered()
      result
    }

  /** @inheritdoc */
  override def stopBackgroundJobs(): Boolean =
    synchronized {
      val result = isBackgroundJobsStarted
      isBackgroundJobsStarted = false
      result
    }

  /** @inheritdoc */
  override def stop(): Unit = {
    val allJobs = runningJobsRef.get()
    allJobs.foreach(_.future.cancel(true))
    runtimeContext.executionService.getContext.getThreadManager
      .interruptThreads()
    jobExecutor.shutdownNow()
    backgroundJobExecutor.shutdownNow()
    pendingCancellationsExecutor.shutdownNow()
  }

  /** Submit background jobs preserving the stable order. */
  private def submitBackgroundJobsOrdered(): Unit = {
    Collections.sort(
      delayedBackgroundJobsQueue,
      BackgroundJob.BACKGROUND_JOBS_QUEUE_ORDER
    )
    runtimeContext.executionService.getLogger.log(
      Level.FINE,
      "Submitting {0} background jobs [{1}]",
      Array[AnyRef](
        delayedBackgroundJobsQueue.size(): Integer,
        delayedBackgroundJobsQueue
      )
    )
    delayedBackgroundJobsQueue.forEach(job => runBackground(job))
    delayedBackgroundJobsQueue.clear()
  }

  private val runningJobPartialFunction: PartialFunction[RunningJob, Job[_]] = {
    case RunningJob(_, job, _) => job
  }

  override def jobInProgress[T](
    filter: PartialFunction[Job[_], Option[T]]
  ): Option[T] = {
    val allJobs    = runningJobsRef.get()
    val fullFilter = runningJobPartialFunction.andThen(filter)
    allJobs.collectFirst(fullFilter).flatten
  }
}
