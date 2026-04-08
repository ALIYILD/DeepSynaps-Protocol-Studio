import { Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { AssessmentBuilderPage } from "../pages/AssessmentBuilderPage";
import LoginPage from "../pages/LoginPage";
import { BrainRegionsPage } from "../pages/BrainRegionsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DeviceRegistryPage } from "../pages/DeviceRegistryPage";
import { DocumentsPage } from "../pages/DocumentsPage";
import { EvidenceLibraryPage } from "../pages/EvidenceLibraryPage";
import { GovernanceSafetyPage } from "../pages/GovernanceSafetyPage";
import { HandbooksPage } from "../pages/HandbooksPage";
import { HowToUsePage } from "../pages/HowToUsePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PatientsPage } from "../pages/PatientsPage";
import { PricingAccessPage } from "../pages/PricingAccessPage";
import { ProtocolsPage } from "../pages/ProtocolsPage";
import { QEEGMapsPage } from "../pages/QEEGMapsPage";
import { SessionsPage } from "../pages/SessionsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { UploadReviewPage } from "../pages/UploadReviewPage";
import { AnalyticsPage } from "../pages/AnalyticsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />

        {/* Top-level */}
        <Route path="/patients" element={<PatientsPage />} />

        {/* Clinical Tools */}
        <Route path="/protocols" element={<ProtocolsPage />} />
        <Route path="/assessment-builder" element={<AssessmentBuilderPage />} />
        <Route path="/how-to-use" element={<HowToUsePage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/handbooks" element={<HandbooksPage />} />
        <Route path="/upload-review" element={<UploadReviewPage />} />

        {/* Reference */}
        <Route path="/evidence-library" element={<EvidenceLibraryPage />} />
        <Route path="/device-registry" element={<DeviceRegistryPage />} />
        <Route path="/brain-regions" element={<BrainRegionsPage />} />
        <Route path="/qeeg-maps" element={<QEEGMapsPage />} />

        {/* Analytics */}
        <Route path="/analytics" element={<AnalyticsPage />} />

        {/* Account */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/governance-safety" element={<GovernanceSafetyPage />} />
        <Route path="/pricing-access" element={<PricingAccessPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
