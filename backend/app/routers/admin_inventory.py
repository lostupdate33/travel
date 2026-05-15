from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.db.session import DEFAULT_TENANT_SLUG, db_session
from app.dependencies import require_database
from app.schemas.admin import (
    DayPlanAdminPayload,
    DestinationAdminPayload,
    HotelAdminPayload,
    VehicleAdminPayload,
)
from app.services.admin_inventory import (
    archive_day_plan,
    archive_destination,
    archive_hotel,
    archive_vehicle,
    attach_background_image,
    attach_destination_image,
    attach_hotel_image,
    create_day_plan,
    create_destination,
    create_hotel,
    create_media_asset,
    create_vehicle,
    update_day_plan,
    update_destination,
    update_hotel,
    update_vehicle,
)
from app.services.inventory_db import load_inventory_from_db


router = APIRouter(prefix="/api/admin", tags=["admin inventory"])


def _admin_inventory_response(session) -> dict[str, Any]:
    return load_inventory_from_db(session, DEFAULT_TENANT_SLUG)


async def _store_upload(
    session,
    *,
    file: UploadFile,
    label: str,
    focal_point: str,
) -> str:
    content = await file.read()
    return create_media_asset(
        session,
        DEFAULT_TENANT_SLUG,
        file_name=file.filename or label or "image",
        mime_type=file.content_type or "application/octet-stream",
        content=content,
        focal_point=focal_point,
    )


@router.post("/destinations")
def admin_create_destination(payload: DestinationAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            create_destination(session, DEFAULT_TENANT_SLUG, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/destinations/{destination_id}")
def admin_update_destination(destination_id: str, payload: DestinationAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            update_destination(session, DEFAULT_TENANT_SLUG, destination_id, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/destinations/{destination_id}")
def admin_archive_destination(destination_id: str) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            archive_destination(session, DEFAULT_TENANT_SLUG, destination_id)
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/destinations/{destination_id}/images")
async def admin_upload_destination_image(
    destination_id: str,
    label: str = Form("Primary image"),
    focal_point: str = Form("center"),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            media_asset_id = await _store_upload(session, file=file, label=label, focal_point=focal_point)
            attach_destination_image(
                session,
                DEFAULT_TENANT_SLUG,
                destination_id,
                media_asset_id=media_asset_id,
                label=label,
                focal_point=focal_point,
            )
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/hotels")
def admin_create_hotel(payload: HotelAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            create_hotel(session, DEFAULT_TENANT_SLUG, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/hotels/{hotel_id}")
def admin_update_hotel(hotel_id: str, payload: HotelAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            update_hotel(session, DEFAULT_TENANT_SLUG, hotel_id, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/hotels/{hotel_id}")
def admin_archive_hotel(hotel_id: str) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            archive_hotel(session, DEFAULT_TENANT_SLUG, hotel_id)
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/hotels/{hotel_id}/images")
async def admin_upload_hotel_image(
    hotel_id: str,
    label: str = Form("Primary image"),
    focal_point: str = Form("center"),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            media_asset_id = await _store_upload(session, file=file, label=label, focal_point=focal_point)
            attach_hotel_image(
                session,
                DEFAULT_TENANT_SLUG,
                hotel_id,
                media_asset_id=media_asset_id,
                label=label,
                focal_point=focal_point,
            )
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/background-images")
async def admin_upload_background_image(
    label: str = Form("Cover image"),
    focal_point: str = Form("center"),
    usage_type: str = Form("cover"),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            media_asset_id = await _store_upload(session, file=file, label=label, focal_point=focal_point)
            attach_background_image(
                session,
                DEFAULT_TENANT_SLUG,
                media_asset_id=media_asset_id,
                label=label,
                focal_point=focal_point,
                usage_type=usage_type,
            )
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/vehicles")
def admin_create_vehicle(payload: VehicleAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            create_vehicle(session, DEFAULT_TENANT_SLUG, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/vehicles/{vehicle_id}")
def admin_update_vehicle(vehicle_id: str, payload: VehicleAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            update_vehicle(session, DEFAULT_TENANT_SLUG, vehicle_id, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/vehicles/{vehicle_id}")
def admin_archive_vehicle(vehicle_id: str) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            archive_vehicle(session, DEFAULT_TENANT_SLUG, vehicle_id)
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/day-plans")
def admin_create_day_plan(payload: DayPlanAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            create_day_plan(session, DEFAULT_TENANT_SLUG, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/day-plans/{day_plan_id}")
def admin_update_day_plan(day_plan_id: str, payload: DayPlanAdminPayload) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            update_day_plan(session, DEFAULT_TENANT_SLUG, day_plan_id, payload.model_dump())
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/day-plans/{day_plan_id}")
def admin_archive_day_plan(day_plan_id: str) -> dict[str, Any]:
    require_database()
    try:
        with db_session() as session:
            archive_day_plan(session, DEFAULT_TENANT_SLUG, day_plan_id)
            return _admin_inventory_response(session)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
