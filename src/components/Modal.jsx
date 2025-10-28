import React from 'react';
import { XIcon } from './Icons'; // For the close button

const Modal = ({ title, onClose, children }) => {
    // This stops the click from closing the modal if you click inside the content area
    const handleContentClick = (e) => {
        e.stopPropagation();
    };

    return (
        // The semi-transparent background overlay
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center"
            // The onClick event has been removed from this div
        >
            {/* The modal content container */}
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-md m-4"
                onClick={handleContentClick}
            >
                {/* Modal Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Modal Body (where the form goes) */}
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
