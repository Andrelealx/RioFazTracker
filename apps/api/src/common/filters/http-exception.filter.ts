import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.extractMessage(exception);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message
    });
  }

  private extractMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return "Internal server error";
    }

    const response = exception.getResponse();
    if (typeof response === "string") {
      return response;
    }

    if (typeof response === "object" && response !== null && "message" in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === "string" || Array.isArray(message)) {
        return message as string | string[];
      }
    }

    return exception.message;
  }
}
