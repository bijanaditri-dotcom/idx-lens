# Scheduling status

No collector schedule is configured by Stage 1. The command below performs
one run from the project root:

```powershell
.\.venv\Scripts\python.exe .\collector\sync_yahoo.py
```

The corrected collector uses a MySQL advisory lock to prevent concurrent runs
on that database. It logs success/failure counts, retries selected transient
HTTP failures, and stops the run on HTTP 429. Repeated rate-limit errors are
a reason to reduce requests and review the source's permitted use.

Stage 7 will choose a schedule using the exchange calendar, time zone,
provider constraints, and measured run duration. A daily end-of-session job
is the initial public-release direction. Do not describe a generic weekday
cron expression as a complete Indonesian trading calendar.

On Windows Task Scheduler, use the root `.venv\Scripts\python.exe` as the
program, the absolute collector path as its argument, and the project root
as the working directory. Configure no overlapping instances and inspect
run logs. These are design notes, not instructions to enable a task now.

GitHub-hosted scheduled jobs cannot reach MySQL on your laptop's loopback
address. Public automation must use independently reachable permitted data
or a deliberately chosen runner arrangement. Do not open the database's
port to the internet to make a cloud schedule work.
