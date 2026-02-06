"""
Job Service
Manages ingestion jobs and background task tracking.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from app.core.config import settings
from app.schemas.ingestion import (
    JobStatus,
    JobType,
    IngestionJobCreate,
    IngestionJobUpdate,
    IngestionJobResponse,
)


class JobService:
    """Manages ingestion job lifecycle and tracking."""

    def __init__(self):
        from supabase import create_client
        if settings.SUPABASE_URL and settings.SUPABASE_KEY:
            self.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        else:
            self.client = None

    def _ensure_client(self):
        if not self.client:
            raise Exception("Supabase not configured")

    def create_job(
        self,
        tenant_id: str,
        job_type: JobType,
        connector_id: Optional[str] = None,
        triggered_by: Optional[str] = None,
        metadata: dict = None,
    ) -> str:
        """Create a new ingestion job and return its ID."""
        self._ensure_client()

        job_id = str(uuid4())
        data = {
            "id": job_id,
            "tenant_id": tenant_id,
            "connector_id": connector_id,
            "job_type": job_type.value if isinstance(job_type, JobType) else job_type,
            "status": JobStatus.PENDING.value,
            "triggered_by": triggered_by,
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat(),
        }

        self.client.table("ingestion_jobs").insert(data).execute()
        return job_id

    def start_job(self, job_id: str, total_items: int = 0) -> None:
        """Mark a job as running."""
        self._ensure_client()

        self.client.table("ingestion_jobs").update({
            "status": JobStatus.RUNNING.value,
            "started_at": datetime.utcnow().isoformat(),
            "total_items": total_items,
        }).eq("id", job_id).execute()

    def update_progress(
        self,
        job_id: str,
        processed: int,
        successful: int = 0,
        failed: int = 0,
        skipped: int = 0,
    ) -> None:
        """Update job progress."""
        self._ensure_client()

        self.client.table("ingestion_jobs").update({
            "processed_items": processed,
            "successful_items": successful,
            "failed_items": failed,
            "skipped_items": skipped,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", job_id).execute()

    def complete_job(
        self,
        job_id: str,
        successful: int,
        failed: int,
        skipped: int = 0,
        warnings: list = None,
    ) -> None:
        """Mark a job as completed."""
        self._ensure_client()

        self.client.table("ingestion_jobs").update({
            "status": JobStatus.COMPLETED.value,
            "completed_at": datetime.utcnow().isoformat(),
            "successful_items": successful,
            "failed_items": failed,
            "skipped_items": skipped,
            "warnings": warnings or [],
        }).eq("id", job_id).execute()

    def fail_job(
        self,
        job_id: str,
        error_message: str,
        error_details: dict = None,
    ) -> None:
        """Mark a job as failed."""
        self._ensure_client()

        self.client.table("ingestion_jobs").update({
            "status": JobStatus.FAILED.value,
            "completed_at": datetime.utcnow().isoformat(),
            "error_message": error_message,
            "error_details": error_details or {},
        }).eq("id", job_id).execute()

    def get_job(self, job_id: str) -> Optional[dict]:
        """Get a job by ID."""
        self._ensure_client()

        result = (
            self.client.table("ingestion_jobs")
            .select("*")
            .eq("id", job_id)
            .single()
            .execute()
        )
        return result.data

    def get_tenant_jobs(
        self,
        tenant_id: str,
        limit: int = 20,
        status: Optional[JobStatus] = None,
    ) -> list[dict]:
        """Get jobs for a tenant."""
        self._ensure_client()

        query = (
            self.client.table("ingestion_jobs")
            .select("*")
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=True)
            .limit(limit)
        )

        if status:
            query = query.eq("status", status.value)

        result = query.execute()
        return result.data or []

    def get_running_jobs(self, tenant_id: str) -> list[dict]:
        """Get currently running jobs for a tenant."""
        return self.get_tenant_jobs(tenant_id, status=JobStatus.RUNNING)


# Singleton instance
job_service = JobService()
