/** @type {import('next').NextConfig} */
export default {
  experimental: {
    // Room for the commish to upload a team photo (up to 4 MB).
    serverActions: { bodySizeLimit: '5mb' },
  },
};
