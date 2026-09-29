import React from "react";
import ReactDOM from "react-dom";
import { settingsStyles } from "../../../styles/settings";

export interface PopupModalContent {
    title: string;
    content: React.ReactNode | Element | string;
    isLarge?: boolean;
}

export const PopupModal = {
    display: ({ title, content, isLarge = false }: PopupModalContent) => {
        // Find existing modal to prevent duplicates or clean up
        const existingDialog = document.querySelector("dialog.fs-popup-modal");
        if (existingDialog) {
            PopupModal.hide();
        }

        const dialog = document.createElement("dialog");
        dialog.className = "fs-popup-modal";
        if (isLarge) dialog.classList.add("fs-popup-modal-large");

        // A native dialog dispatches backdrop clicks directly on the dialog itself.
        // Checking the target avoids treating synthetic child clicks as backdrop clicks
        // when those clicks have no pointer coordinates.
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) PopupModal.hide();
        });

        // Close on Esc key natively works, but we also want to clean up our DOM correctly
        dialog.addEventListener("close", () => {
            PopupModal.hide();
        });

        const header = document.createElement("div");
        header.className = "fs-popup-modal-header";
        header.innerHTML = `
            <h1 class="main-type-alto" as="h1">${title}</h1>
            <button aria-label="Close" class="fs-popup-modal-close-btn">
                <svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                    <path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill-rule="evenodd"/>
                </svg>
            </button>
        `;

        header.querySelector("button")?.addEventListener("click", () => {
            PopupModal.hide();
        });

        const mainContainer = document.createElement("div");
        mainContainer.className = "fs-popup-modal-main-section";
        const main = document.createElement("main");
        
        mainContainer.appendChild(main);

        if (React.isValidElement(content)) {
            ReactDOM.render(content as React.ReactElement, main);
            dialog.dataset.hasReact = "true";
        } else if (content instanceof Element) {
            main.appendChild(content);
        } else if (typeof content === "string") {
            main.innerHTML = content;
        }

        const style = document.createElement("style");
        style.textContent = settingsStyles;
        dialog.appendChild(style);
        dialog.appendChild(header);
        dialog.appendChild(mainContainer);
        document.body.appendChild(dialog);
        
        dialog.showModal();
    },

    hide: () => {
        const dialog = document.querySelector("dialog.fs-popup-modal");
        if (dialog instanceof HTMLDialogElement) {
            if (dialog.dataset.hasReact === "true") {
                const main = dialog.querySelector("main");
                if (main) ReactDOM.unmountComponentAtNode(main);
            }
            dialog.close();
            dialog.remove();
        }
    }
};
