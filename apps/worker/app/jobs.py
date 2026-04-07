from pydantic import BaseModel


class RenderJob(BaseModel):
    job_id: str
    output_type: str
    protocol_id: str


def enqueue_render_job(job: RenderJob) -> dict[str, str]:
    # TODO: replace this placeholder with a durable queue integration.
    return {"status": "queued", "job_id": job.job_id}
